package com.hamcheeze.chat.room.receipt;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;

public final class RoomReadReceiptBatcher
        implements RoomReadPositionAdvanceObserver, SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(
            RoomReadReceiptBatcher.class);

    private final ReentrantLock stateLock = new ReentrantLock();
    private final ReentrantLock flushLock = new ReentrantLock();
    private Map<String, Map<String, RoomReadPositionAdvance>> pending =
            new HashMap<>();
    private final Map<String, Long> dirtyGenerations =
            new HashMap<>();
    private final RoomReadReceiptDeliveryPort delivery;
    private final RoomReadReceiptProperties properties;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final AtomicBoolean running = new AtomicBoolean();
    private final Counter enqueuedCounter;
    private final Counter coalescedCounter;
    private final Counter rejectedCounter;
    private final Counter eventPublishedCounter;
    private final Counter eventFailureCounter;
    private final Counter eventUpdatesCounter;
    private final Counter invalidationPublishedCounter;
    private final Counter invalidationFailureCounter;
    private volatile Thread worker;

    public RoomReadReceiptBatcher(
            RoomReadReceiptDeliveryPort delivery,
            RoomReadReceiptProperties properties,
            ObjectMapper objectMapper,
            Clock clock,
            MeterRegistry meterRegistry
    ) {
        this.delivery = Objects.requireNonNull(delivery, "delivery");
        this.properties = Objects.requireNonNull(
                properties, "properties");
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.enqueuedCounter = meterRegistry.counter(
                "room.read_receipt.advance.enqueued");
        this.coalescedCounter = meterRegistry.counter(
                "room.read_receipt.advance.coalesced");
        this.rejectedCounter = meterRegistry.counter(
                "room.read_receipt.advance.rejected");
        this.eventPublishedCounter = meterRegistry.counter(
                "room.read_receipt.event.published");
        this.eventFailureCounter = meterRegistry.counter(
                "room.read_receipt.event.failures");
        this.eventUpdatesCounter = meterRegistry.counter(
                "room.read_receipt.event.updates");
        this.invalidationPublishedCounter = meterRegistry.counter(
                "room.read_receipt.invalidation.published");
        this.invalidationFailureCounter = meterRegistry.counter(
                "room.read_receipt.invalidation.failures");
        Gauge.builder(
                        "room.read_receipt.pending.rooms",
                        this,
                        RoomReadReceiptBatcher::pendingRoomCount)
                .register(meterRegistry);
        Gauge.builder(
                        "room.read_receipt.dirty.rooms",
                        this,
                        RoomReadReceiptBatcher::dirtyRoomCount)
                .register(meterRegistry);
    }

    @Override
    public void onAdvanced(
            String roomId,
            String membershipId,
            long membershipVersion,
            long storedLastReadSequence
    ) {
        RoomReadPositionAdvance incoming =
                new RoomReadPositionAdvance(
                        membershipId,
                        membershipVersion,
                        storedLastReadSequence);
        requireText(roomId, "roomId");
        stateLock.lock();
        try {
            if (dirtyGenerations.containsKey(roomId)) {
                markDirtyLocked(roomId);
                recordRejected();
                return;
            }
            Map<String, RoomReadPositionAdvance> roomPending =
                    pending.get(roomId);
            if (roomPending == null) {
                if (pending.size()
                        >= properties.getMaxPendingRooms()) {
                    markDirtyLocked(roomId);
                    recordRejected();
                    return;
                }
                roomPending = new HashMap<>();
                pending.put(roomId, roomPending);
            }
            RoomReadPositionAdvance existing = roomPending.get(
                    membershipId);
            if (existing == null) {
                roomPending.put(membershipId, incoming);
                recordEnqueued();
                return;
            }
            if (incoming.membershipVersion()
                    < existing.membershipVersion()) {
                recordRejected();
                return;
            }
            if (incoming.membershipVersion()
                    > existing.membershipVersion()) {
                roomPending.put(membershipId, incoming);
                recordCoalesced();
                return;
            }
            roomPending.put(
                    membershipId,
                    new RoomReadPositionAdvance(
                            membershipId,
                            membershipVersion,
                            Math.max(
                                    existing.storedLastReadSequence(),
                                    storedLastReadSequence)));
            recordCoalesced();
        } catch (RuntimeException exception) {
            markDirtyLocked(roomId);
            recordRejected();
            logBestEffort(
                    "Read Receipt update enqueue failed",
                    roomId,
                    exception);
        } finally {
            stateLock.unlock();
        }
    }

    @Override
    public void start() {
        if (!running.compareAndSet(false, true)) {
            return;
        }
        worker = Thread.ofPlatform()
                .name("room-read-receipt-batcher")
                .start(this::runWorker);
    }

    @Override
    public void stop(Runnable callback) {
        running.set(false);
        Thread current = worker;
        if (current != null) {
            current.interrupt();
            try {
                current.join(Math.max(
                        1_000,
                        properties.getFlushInterval().toMillis() * 2));
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        }
        callback.run();
    }

    @Override
    public void stop() {
        CountDownLatch latch = new CountDownLatch(1);
        stop(latch::countDown);
    }

    @Override
    public boolean isRunning() {
        return running.get();
    }

    void flushNow() {
        flushLock.lock();
        try {
            Map<String, Map<String, RoomReadPositionAdvance>> detached =
                    detachPending();
            detached.forEach(this::flushRoom);
            flushDirty();
        } finally {
            flushLock.unlock();
        }
    }

    int pendingRoomCount() {
        stateLock.lock();
        try {
            return pending.size();
        } finally {
            stateLock.unlock();
        }
    }

    int dirtyRoomCount() {
        stateLock.lock();
        try {
            return dirtyGenerations.size();
        } finally {
            stateLock.unlock();
        }
    }

    private void runWorker() {
        try {
            while (running.get()) {
                try {
                    Thread.sleep(Math.max(
                            1,
                            properties.getFlushInterval().toMillis()));
                } catch (InterruptedException exception) {
                    if (running.get()) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
                flushSafely();
            }
        } finally {
            flushSafely();
        }
    }

    private void flushSafely() {
        try {
            flushNow();
        } catch (RuntimeException exception) {
            logBestEffort(
                    "Read Receipt batch flush failed",
                    "unknown",
                    exception);
        }
    }

    private Map<String, Map<String, RoomReadPositionAdvance>>
    detachPending() {
        stateLock.lock();
        try {
            Map<String, Map<String, RoomReadPositionAdvance>> detached =
                    pending;
            pending = new HashMap<>();
            return detached;
        } finally {
            stateLock.unlock();
        }
    }

    private void flushRoom(
            String roomId,
            Map<String, RoomReadPositionAdvance> byMembership
    ) {
        if (isDirty(roomId)) {
            return;
        }
        List<RoomReadPositionAdvance> updates = byMembership.values()
                .stream()
                .sorted(Comparator.comparing(
                        RoomReadPositionAdvance::membershipId))
                .toList();
        List<RoomReadPositionAdvance> chunk = new ArrayList<>();
        for (RoomReadPositionAdvance update : updates) {
            if (chunk.size()
                    >= properties.getMaxUpdatesPerEvent()) {
                if (!publishDelta(roomId, chunk)) {
                    return;
                }
                chunk = new ArrayList<>();
            }
            List<RoomReadPositionAdvance> candidate =
                    new ArrayList<>(chunk);
            candidate.add(update);
            if (serializedBytes(delta(roomId, candidate))
                    >= properties.getMaxEventBytes()) {
                if (chunk.isEmpty()) {
                    markDirty(roomId);
                    recordEventFailure();
                    return;
                }
                if (!publishDelta(roomId, chunk)) {
                    return;
                }
                chunk = new ArrayList<>();
                if (serializedBytes(delta(roomId, List.of(update)))
                        >= properties.getMaxEventBytes()) {
                    markDirty(roomId);
                    recordEventFailure();
                    return;
                }
            }
            chunk.add(update);
        }
        if (!chunk.isEmpty()) {
            publishDelta(roomId, chunk);
        }
    }

    private boolean publishDelta(
            String roomId,
            List<RoomReadPositionAdvance> updates
    ) {
        final RoomReadReceiptEventEnvelope event;
        try {
            event = delta(roomId, updates);
            if (serializedBytes(event)
                    >= properties.getMaxEventBytes()) {
                markDirty(roomId);
                recordEventFailure();
                return false;
            }
        } catch (RuntimeException exception) {
            markDirty(roomId);
            recordEventFailure();
            logBestEffort(
                    "Read Receipt delta serialization failed",
                    roomId,
                    exception);
            return false;
        }
        RoomReadReceiptDeliveryOutcome outcome;
        try {
            outcome = delivery.publish(event);
        } catch (RuntimeException exception) {
            outcome = RoomReadReceiptDeliveryOutcome.FAILED;
            logBestEffort(
                    "Read Receipt delta publisher failed",
                    roomId,
                    exception);
        }
        if (outcome != RoomReadReceiptDeliveryOutcome.ACCEPTED) {
            markDirty(roomId);
            recordEventFailure();
            return false;
        }
        BestEffortMetricRecorder.increment(
                "room.read_receipt.event.published",
                eventPublishedCounter);
        BestEffortMetricRecorder.increment(
                "room.read_receipt.event.updates",
                eventUpdatesCounter,
                updates.size());
        return true;
    }

    private void flushDirty() {
        Map<String, Long> snapshot = dirtySnapshot();
        for (Map.Entry<String, Long> entry : snapshot.entrySet()) {
            String roomId = entry.getKey();
            RoomReadReceiptEventEnvelope event = invalidation(roomId);
            RoomReadReceiptDeliveryOutcome outcome;
            try {
                outcome = delivery.publish(event);
            } catch (RuntimeException exception) {
                outcome = RoomReadReceiptDeliveryOutcome.FAILED;
                logBestEffort(
                        "Read Receipt invalidation publisher failed",
                        roomId,
                        exception);
            }
            if (outcome == RoomReadReceiptDeliveryOutcome.ACCEPTED) {
                clearDirty(roomId, entry.getValue());
                BestEffortMetricRecorder.increment(
                        "room.read_receipt.invalidation.published",
                        invalidationPublishedCounter);
            } else {
                BestEffortMetricRecorder.increment(
                        "room.read_receipt.invalidation.failures",
                        invalidationFailureCounter);
            }
        }
    }

    private RoomReadReceiptEventEnvelope delta(
            String roomId,
            List<RoomReadPositionAdvance> updates
    ) {
        return new RoomReadReceiptEventEnvelope(
                RoomReadReceiptEventEnvelope.CURRENT_EVENT_VERSION,
                UUID.randomUUID().toString(),
                RoomReadReceiptEventType
                        .ROOM_READ_POSITIONS_ADVANCED,
                clock.instant(),
                new RoomReadPositionsAdvancedPayload(
                        roomId,
                        updates));
    }

    private RoomReadReceiptEventEnvelope invalidation(String roomId) {
        return new RoomReadReceiptEventEnvelope(
                RoomReadReceiptEventEnvelope.CURRENT_EVENT_VERSION,
                UUID.randomUUID().toString(),
                RoomReadReceiptEventType
                        .ROOM_READ_RECEIPT_STATE_INVALIDATED,
                clock.instant(),
                new RoomReadReceiptStateInvalidatedPayload(
                        roomId,
                        RoomReadReceiptStateInvalidatedPayload
                                .DELTA_GAP_POSSIBLE));
    }

    private int serializedBytes(RoomReadReceiptEventEnvelope event) {
        return objectMapper.writeValueAsBytes(event).length;
    }

    private boolean isDirty(String roomId) {
        stateLock.lock();
        try {
            return dirtyGenerations.containsKey(roomId);
        } finally {
            stateLock.unlock();
        }
    }

    private void markDirty(String roomId) {
        stateLock.lock();
        try {
            markDirtyLocked(roomId);
        } finally {
            stateLock.unlock();
        }
    }

    private void markDirtyLocked(String roomId) {
        Long generation = dirtyGenerations.get(roomId);
        if (generation != null) {
            dirtyGenerations.put(
                    roomId,
                    generation == Long.MAX_VALUE
                            ? generation : generation + 1);
            return;
        }
        if (dirtyGenerations.size()
                < properties.getMaxPendingRooms()) {
            dirtyGenerations.put(roomId, 1L);
            pending.remove(roomId);
            return;
        }
        logBestEffort(
                "Read Receipt dirty Room capacity exhausted",
                roomId,
                null);
    }

    private Map<String, Long> dirtySnapshot() {
        stateLock.lock();
        try {
            return Map.copyOf(dirtyGenerations);
        } finally {
            stateLock.unlock();
        }
    }

    private void clearDirty(String roomId, long generation) {
        stateLock.lock();
        try {
            dirtyGenerations.computeIfPresent(
                    roomId,
                    (ignored, current) -> current == generation
                            ? null : current);
        } finally {
            stateLock.unlock();
        }
    }

    private void recordEnqueued() {
        BestEffortMetricRecorder.increment(
                "room.read_receipt.advance.enqueued",
                enqueuedCounter);
    }

    private void recordCoalesced() {
        BestEffortMetricRecorder.increment(
                "room.read_receipt.advance.coalesced",
                coalescedCounter);
    }

    private void recordRejected() {
        BestEffortMetricRecorder.increment(
                "room.read_receipt.advance.rejected",
                rejectedCounter);
    }

    private void recordEventFailure() {
        BestEffortMetricRecorder.increment(
                "room.read_receipt.event.failures",
                eventFailureCounter);
    }

    private static void logBestEffort(
            String message,
            String roomId,
            RuntimeException exception
    ) {
        try {
            log.warn(
                    "{}: roomId={}, exceptionClass={}",
                    message,
                    roomId,
                    exception == null
                            ? "none" : exception.getClass().getName());
        } catch (RuntimeException ignored) {
            // Observability must not affect cursor persistence.
        }
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
    }
}
