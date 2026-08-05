package com.hamcheeze.chat.room.inbox.notification;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxDispatcher;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxEvent;
import com.hamcheeze.chat.message.outbox.ClaimedChatMessageOutboxEvent;
import com.hamcheeze.chat.message.outbox.PublishedChatMessageObserver;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.inbox.RoomInboxProperties;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public final class RoomInboxNotificationPipeline
        implements PublishedChatMessageObserver, SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(
            RoomInboxNotificationPipeline.class);
    public static final int LIFECYCLE_PHASE =
            ChatMessageOutboxDispatcher.LIFECYCLE_PHASE - 1_000;

    private final BlockingQueue<RoomInboxNotificationIntent> queue;
    private final RoomQueryReader roomReader;
    private final RoomInboxCurrentSummaryReader currentSummaryReader;
    private final ActiveConnectionRegistry activeConnections;
    private final RoomInboxEventDelivery delivery;
    private final RoomInboxProperties.Notification properties;
    private final ObjectMapper objectMapper;
    private final int maxPublicEventBytes;
    private final Clock clock;
    private final AtomicBoolean running = new AtomicBoolean();
    private final AtomicInteger workerRunning = new AtomicInteger();
    private final Counter enqueuedCounter;
    private final Counter droppedCounter;
    private final Counter coalescedCounter;
    private final Counter roomBatchSizeCounter;
    private final Counter recipientsCounter;
    private final Counter successCounter;
    private final Counter failureCounter;
    private final Counter duplicateCounter;
    private final Counter snapshotRejectedCounter;
    private final Counter publicEventSplitCounter;
    private final Counter publicEventOversizedCounter;
    private final Counter publicEventSourcesCounter;
    private final Counter summaryResolutionFailureCounter;
    private final Timer dispatchTimer;
    private volatile Thread worker;

    public RoomInboxNotificationPipeline(
            RoomQueryReader roomReader,
            RoomInboxCurrentSummaryReader currentSummaryReader,
            ActiveConnectionRegistry activeConnections,
            RoomInboxEventDelivery delivery,
            RoomInboxProperties inboxProperties,
            ObjectMapper objectMapper,
            ChatContentProperties contentProperties,
            Clock clock,
            MeterRegistry meterRegistry
    ) {
        this.roomReader = Objects.requireNonNull(
                roomReader, "roomReader");
        this.currentSummaryReader = Objects.requireNonNull(
                currentSummaryReader, "currentSummaryReader");
        this.activeConnections = Objects.requireNonNull(
                activeConnections, "activeConnections");
        this.delivery = Objects.requireNonNull(delivery, "delivery");
        this.properties = Objects.requireNonNull(
                inboxProperties, "inboxProperties").getNotification();
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
        this.maxPublicEventBytes = Objects.requireNonNull(
                contentProperties, "contentProperties")
                .getMaxStompMessageBytes();
        this.clock = Objects.requireNonNull(clock, "clock");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.queue = new ArrayBlockingQueue<>(
                properties.getQueueCapacity());
        this.enqueuedCounter = meterRegistry.counter(
                "room.inbox.notification.enqueued");
        this.droppedCounter = meterRegistry.counter(
                "room.inbox.notification.enqueue.dropped");
        this.coalescedCounter = meterRegistry.counter(
                "room.inbox.notification.coalesced");
        this.roomBatchSizeCounter = meterRegistry.counter(
                "room.inbox.notification.room_batch.size");
        this.recipientsCounter = meterRegistry.counter(
                "room.inbox.notification.recipients");
        this.successCounter = meterRegistry.counter(
                "room.inbox.notification.delivery.success");
        this.failureCounter = meterRegistry.counter(
                "room.inbox.notification.delivery.failure");
        this.duplicateCounter = meterRegistry.counter(
                "room.inbox.notification.duplicate.source");
        this.snapshotRejectedCounter = meterRegistry.counter(
                "room.inbox.notification.recipient_snapshot.rejected");
        this.publicEventSplitCounter = meterRegistry.counter(
                "room.inbox.notification.public_event.split");
        this.publicEventOversizedCounter = meterRegistry.counter(
                "room.inbox.notification.public_event.oversized");
        this.publicEventSourcesCounter = meterRegistry.counter(
                "room.inbox.notification.public_event.sources");
        this.summaryResolutionFailureCounter = meterRegistry.counter(
                "room.inbox.notification.summary_resolution.failure");
        this.dispatchTimer = meterRegistry.timer(
                "room.inbox.notification.dispatch.duration");
        Gauge.builder(
                        "room.inbox.notification.queue.depth",
                        queue,
                        BlockingQueue::size)
                .register(meterRegistry);
    }

    @Override
    public void onPublished(
            ClaimedChatMessageOutboxEvent claimed,
            ChatMessageEventEnvelope envelope
    ) {
        if (!ChatMessageOutboxEvent.MESSAGE_CREATED.equals(
                envelope.eventType())
                && !ChatMessageOutboxEvent.MESSAGE_UPDATED.equals(
                envelope.eventType())
                && !ChatMessageOutboxEvent.MESSAGE_DELETED.equals(
                envelope.eventType())) {
            return;
        }
        RoomInboxNotificationIntent intent =
                RoomInboxNotificationIntent.from(claimed, envelope);
        if (queue.offer(intent)) {
            BestEffortMetricRecorder.increment(
                    "room.inbox.notification.enqueued",
                    enqueuedCounter);
            return;
        }
        BestEffortMetricRecorder.increment(
                "room.inbox.notification.enqueue.dropped",
                droppedCounter);
        log.warn(
                "Room inbox notification intent dropped because queue "
                        + "is full: eventId={}, roomId={}",
                claimed.eventId(), envelope.payload().roomId());
    }

    @Override
    public void start() {
        if (!running.compareAndSet(false, true)) {
            return;
        }
        worker = Thread.ofPlatform()
                .name("room-inbox-notification")
                .start(this::runWorker);
    }

    @Override
    public void stop(Runnable callback) {
        running.set(false);
        Thread current = worker;
        if (current != null) {
            current.interrupt();
            try {
                current.join(properties.getShutdownDrainTimeoutMs());
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

    @Override
    public int getPhase() {
        return LIFECYCLE_PHASE;
    }

    private void runWorker() {
        workerRunning.set(1);
        try {
            while (running.get() || !queue.isEmpty()) {
                List<RoomInboxNotificationIntent> window =
                        collectWindow();
                if (!window.isEmpty()) {
                    flush(window);
                }
            }
        } finally {
            workerRunning.set(0);
        }
    }

    private List<RoomInboxNotificationIntent> collectWindow() {
        List<RoomInboxNotificationIntent> result = new ArrayList<>();
        try {
            RoomInboxNotificationIntent first = queue.poll(
                    properties.getCoalescingWindowMs(),
                    TimeUnit.MILLISECONDS);
            if (first == null) {
                return result;
            }
            result.add(first);
            long deadline = System.nanoTime()
                    + TimeUnit.MILLISECONDS.toNanos(
                    properties.getCoalescingWindowMs());
            while (result.size() < properties.getQueueCapacity()) {
                long remaining = deadline - System.nanoTime();
                if (remaining <= 0) {
                    break;
                }
                RoomInboxNotificationIntent next = queue.poll(
                        remaining, TimeUnit.NANOSECONDS);
                if (next == null) {
                    break;
                }
                result.add(next);
            }
        } catch (InterruptedException exception) {
            if (running.get()) {
                Thread.currentThread().interrupt();
            }
        }
        return result;
    }

    private void flush(List<RoomInboxNotificationIntent> window) {
        Map<String, List<RoomInboxNotificationIntent>> byRoom =
                new LinkedHashMap<>();
        for (RoomInboxNotificationIntent intent : window) {
            byRoom.computeIfAbsent(intent.roomId(), ignored ->
                    new ArrayList<>()).add(intent);
        }
        for (List<RoomInboxNotificationIntent> batch :
                byRoom.values()) {
            flushRoom(batch);
        }
    }

    private void flushRoom(List<RoomInboxNotificationIntent> rawBatch) {
        long started = System.nanoTime();
        try {
            List<RoomInboxNotificationIntent> batch =
                    deduplicate(rawBatch);
            BestEffortMetricRecorder.increment(
                    "room.inbox.notification.room_batch.size",
                    roomBatchSizeCounter,
                    batch.size());
            if (batch.size() > 1) {
                for (int ignored = 1; ignored < batch.size(); ignored++) {
                    BestEffortMetricRecorder.increment(
                            "room.inbox.notification.coalesced",
                            coalescedCounter);
                }
            }
            String roomId = batch.getFirst().roomId();
            Room room = roomReader.findRoomById(roomId).orElse(null);
            if (room == null || room.status() != RoomStatus.ACTIVE) {
                return;
            }
            int snapshotLimit = properties
                    .getMaxRecipientSnapshotSize();
            if (room.activeMemberCount() > snapshotLimit) {
                rejectRecipientSnapshot(
                        roomId, room.activeMemberCount(), snapshotLimit);
                return;
            }
            CursorSlice<Membership> slice = roomReader
                    .findMembershipsByRoomAndStatus(
                            roomId,
                            MembershipStatus.ACTIVE,
                            null,
                            snapshotLimit);
            if (slice.hasNext()
                    || slice.items().size()
                    != room.activeMemberCount()) {
                BestEffortMetricRecorder.increment(
                        "room.inbox.notification."
                                + "recipient_snapshot.rejected",
                        snapshotRejectedCounter);
                log.warn(
                        "Room inbox recipient snapshot is inconsistent; "
                                + "batch dropped: roomId={}",
                        roomId);
                return;
            }
            Set<String> deletedMessageIds = new LinkedHashSet<>();
            for (RoomInboxNotificationIntent intent : batch) {
                if (ChatMessageOutboxEvent.MESSAGE_DELETED.equals(
                        intent.eventType())) {
                    deletedMessageIds.add(intent.messageId());
                }
            }
            List<RoomInboxNotificationIntent> currentUpdates =
                    resolveCurrentUpdates(
                            roomId, batch, deletedMessageIds);
            Set<String> currentUpdateSourceIds = currentUpdates.stream()
                    .map(RoomInboxNotificationIntent
                            ::sourceOutboxEventId)
                    .collect(java.util.stream.Collectors.toSet());
            for (Membership membership : slice.items()) {
                String connectionId = activeConnections
                        .findConnectionIdByUser(membership.userId())
                        .orElse(null);
                if (connectionId == null
                        || !activeConnections.isActive(
                        membership.userId(), connectionId)) {
                    continue;
                }
                if (deliverRecipient(
                        room,
                        membership,
                        connectionId,
                        batch,
                        currentUpdateSourceIds,
                        deletedMessageIds)) {
                    BestEffortMetricRecorder.increment(
                            "room.inbox.notification.recipients",
                            recipientsCounter);
                }
            }
        } catch (RuntimeException exception) {
            log.warn(
                    "Room inbox notification room batch failed; "
                            + "the message outbox remains successful",
                    exception);
        } finally {
            BestEffortMetricRecorder.record(
                    "room.inbox.notification.dispatch.duration",
                    dispatchTimer,
                    Duration.ofNanos(Math.max(
                            0, System.nanoTime() - started)));
        }
    }

    private List<RoomInboxNotificationIntent> resolveCurrentUpdates(
            String roomId,
            List<RoomInboxNotificationIntent> batch,
            Set<String> deletedMessageIds
    ) {
        List<RoomInboxNotificationIntent> updates = batch.stream()
                .filter(intent -> ChatMessageOutboxEvent.MESSAGE_UPDATED
                        .equals(intent.eventType()))
                .toList();
        if (updates.isEmpty()) {
            return List.of();
        }
        final Optional<RoomInboxCurrentLastMessage> resolved;
        try {
            resolved = currentSummaryReader.findCurrent(roomId);
        } catch (RuntimeException exception) {
            recordSummaryResolutionFailure(
                    roomId,
                    exception instanceof RoomInboxCurrentSummaryReadException
                            readException
                            ? readException.failureKind()
                            : "runtime-exception",
                    exception);
            return withoutDeletedUpdates(updates, deletedMessageIds);
        }
        if (resolved.isEmpty()) {
            recordSummaryResolutionFailure(
                    roomId, "summary-missing", null);
            return withoutDeletedUpdates(updates, deletedMessageIds);
        }
        RoomInboxCurrentLastMessage current = resolved.orElseThrow();
        return updates.stream()
                .filter(intent -> isCurrentUpdate(
                        intent.message(), current))
                .filter(intent -> !deletedMessageIds.contains(
                        intent.messageId()))
                .toList();
    }

    private static List<RoomInboxNotificationIntent>
    withoutDeletedUpdates(
            List<RoomInboxNotificationIntent> updates,
            Set<String> deletedMessageIds
    ) {
        return updates.stream()
                .filter(intent -> !deletedMessageIds.contains(
                        intent.messageId()))
                .toList();
    }

    private static boolean isCurrentUpdate(
            ChatMessagePayload update,
            RoomInboxCurrentLastMessage current
    ) {
        return update.state() == MessageState.ACTIVE
                && current.state() == MessageState.ACTIVE
                && current.messageId().equals(update.messageId())
                && current.roomSequence() == update.roomSequence()
                && current.messageVersion() == update.messageVersion();
    }

    private void recordSummaryResolutionFailure(
            String roomId,
            String failureKind,
            RuntimeException exception
    ) {
        BestEffortMetricRecorder.increment(
                "room.inbox.notification.summary_resolution.failure",
                summaryResolutionFailureCounter);
        log.warn(
                "Room inbox notification summary resolution failed; "
                        + "conservative invalidation enabled: roomId={}, "
                        + "failureKind={}, exceptionClass={}",
                roomId,
                failureKind,
                exception == null
                        ? "none" : exception.getClass().getName());
    }

    private void rejectRecipientSnapshot(
            String roomId,
            int activeMemberCount,
            int snapshotLimit
    ) {
        BestEffortMetricRecorder.increment(
                "room.inbox.notification.recipient_snapshot.rejected",
                snapshotRejectedCounter);
        log.warn(
                "Room inbox recipient snapshot exceeds safety limit; "
                        + "batch dropped: roomId={}, activeMemberCount={}, "
                        + "snapshotLimit={}",
                roomId,
                activeMemberCount,
                snapshotLimit);
    }

    private List<RoomInboxNotificationIntent> deduplicate(
            List<RoomInboxNotificationIntent> batch
    ) {
        Map<String, RoomInboxNotificationIntent> unique =
                new LinkedHashMap<>();
        for (RoomInboxNotificationIntent intent : batch) {
            if (unique.putIfAbsent(
                    intent.sourceOutboxEventId(), intent) != null) {
                BestEffortMetricRecorder.increment(
                        "room.inbox.notification.duplicate.source",
                        duplicateCounter);
            }
        }
        return List.copyOf(unique.values());
    }

    private boolean deliverRecipient(
            Room room,
            Membership membership,
            String connectionId,
            List<RoomInboxNotificationIntent> batch,
            Set<String> currentUpdateSourceIds,
            Set<String> deletedMessageIds
    ) {
        List<RoomInboxNotificationIntent> creates = new ArrayList<>();
        List<RoomInboxNotificationIntent> updates = new ArrayList<>();
        List<RoomInboxNotificationIntent> deletes = new ArrayList<>();
        collectEligibleRecipientEvents(
                batch,
                membership,
                currentUpdateSourceIds,
                deletedMessageIds,
                creates,
                updates,
                deletes);
        deliverCreatedChunks(
                room, membership.userId(), connectionId, creates);
        deliverUpdatedChunks(
                room, membership.userId(), connectionId, updates);
        deliverDeletedChunks(
                room, membership.userId(), connectionId, deletes);
        return !creates.isEmpty()
                || !updates.isEmpty()
                || !deletes.isEmpty();
    }

    private void deliverUpdatedChunks(
            Room room,
            String userId,
            String connectionId,
            List<RoomInboxNotificationIntent> updates
    ) {
        forEachPublicEventChunk(updates, chunk -> deliverOne(
                userId,
                connectionId,
                new RoomInboxEvent(
                        RoomInboxEvent.CURRENT_EVENT_VERSION,
                        UUID.randomUUID().toString(),
                        RoomInboxEvent.EVENT_TYPE,
                        RoomInboxEvent.Cause.MESSAGE_UPDATED,
                        room.roomId(),
                        null,
                        clock.instant(),
                        sourceEventIds(chunk),
                        null,
                        null)));
    }

    private void deliverCreatedChunks(
            Room room,
            String userId,
            String connectionId,
            List<RoomInboxNotificationIntent> creates
    ) {
        forEachPublicEventChunk(creates, chunk -> {
            RoomInboxNotificationIntent latest = chunk.stream()
                    .max(java.util.Comparator.comparingLong(
                            value -> value.message().roomSequence()))
                    .orElseThrow();
            NotificationPreview preview = NotificationPreview.from(
                    latest.message().content());
            deliverOne(
                    userId,
                    connectionId,
                    new RoomInboxEvent(
                            RoomInboxEvent.CURRENT_EVENT_VERSION,
                            UUID.randomUUID().toString(),
                            RoomInboxEvent.EVENT_TYPE,
                            RoomInboxEvent.Cause.MESSAGE_CREATED,
                            room.roomId(),
                            room.name(),
                            clock.instant(),
                            sourceEventIds(chunk),
                            chunk.size(),
                            new RoomInboxNotificationHint(
                                    latest.message().messageId(),
                                    latest.message().messageVersion(),
                                    latest.message().senderUserId(),
                                    latest.message().createdAt(),
                                    preview.value(),
                                    preview.truncated())));
        });
    }

    private void deliverDeletedChunks(
            Room room,
            String userId,
            String connectionId,
            List<RoomInboxNotificationIntent> deletes
    ) {
        forEachPublicEventChunk(deletes, chunk -> deliverOne(
                userId,
                connectionId,
                new RoomInboxEvent(
                        RoomInboxEvent.CURRENT_EVENT_VERSION,
                        UUID.randomUUID().toString(),
                        RoomInboxEvent.EVENT_TYPE,
                        RoomInboxEvent.Cause.MESSAGE_DELETED,
                        room.roomId(),
                        null,
                        clock.instant(),
                        sourceEventIds(chunk),
                        null,
                        null)));
    }

    private void forEachPublicEventChunk(
            List<RoomInboxNotificationIntent> intents,
            java.util.function.Consumer<
                    List<RoomInboxNotificationIntent>> consumer
    ) {
        int chunkSize = properties.getMaxEventsPerRoomBatch();
        int chunks = (intents.size() + chunkSize - 1) / chunkSize;
        if (chunks > 1) {
            BestEffortMetricRecorder.increment(
                    "room.inbox.notification.public_event.split",
                    publicEventSplitCounter,
                    chunks - 1);
        }
        for (int from = 0; from < intents.size(); from += chunkSize) {
            consumer.accept(List.copyOf(intents.subList(
                    from, Math.min(intents.size(), from + chunkSize))));
        }
    }

    private static List<String> sourceEventIds(
            List<RoomInboxNotificationIntent> intents
    ) {
        return intents.stream()
                .map(RoomInboxNotificationIntent::sourceOutboxEventId)
                .toList();
    }

    private static void collectEligibleRecipientEvents(
            List<RoomInboxNotificationIntent> chunk,
            Membership membership,
            Set<String> currentUpdateSourceIds,
            Set<String> deletedMessageIds,
            List<RoomInboxNotificationIntent> creates,
            List<RoomInboxNotificationIntent> updates,
            List<RoomInboxNotificationIntent> deletes
    ) {
        for (RoomInboxNotificationIntent intent : chunk) {
            if (ChatMessageOutboxEvent.MESSAGE_CREATED.equals(
                    intent.eventType())) {
                if (isCreateToastEligible(
                        intent.message(), membership)
                        && !deletedMessageIds.contains(
                        intent.messageId())) {
                    creates.add(intent);
                }
                continue;
            }
            if (!isMutationInvalidationEligible(
                    intent.message(), membership)) {
                continue;
            }
            if (ChatMessageOutboxEvent.MESSAGE_UPDATED.equals(
                    intent.eventType())) {
                if (currentUpdateSourceIds.contains(
                        intent.sourceOutboxEventId())
                        && !deletedMessageIds.contains(
                        intent.messageId())) {
                    updates.add(intent);
                }
                continue;
            }
            if (ChatMessageOutboxEvent.MESSAGE_DELETED.equals(
                    intent.eventType())) {
                deletes.add(intent);
            }
        }
    }

    private static boolean isCreateToastEligible(
            ChatMessagePayload message,
            Membership membership
    ) {
        return membership.status() == MembershipStatus.ACTIVE
                && message.countable()
                && message.roomSequence()
                > membership.messageVisibleAfterSequence()
                && !message.senderUserId().equals(
                membership.userId());
    }

    private static boolean isMutationInvalidationEligible(
            ChatMessagePayload message,
            Membership membership
    ) {
        return membership.status() == MembershipStatus.ACTIVE
                && message.roomSequence()
                > membership.messageVisibleAfterSequence();
    }

    private void deliverOne(
            String userId,
            String connectionId,
            RoomInboxEvent event
    ) {
        try {
            int serializedBytes = objectMapper
                    .writeValueAsBytes(event).length;
            if (serializedBytes >= maxPublicEventBytes) {
                BestEffortMetricRecorder.increment(
                        "room.inbox.notification.public_event.oversized",
                        publicEventOversizedCounter);
                log.warn(
                        "Room inbox public event dropped because its "
                                + "serialized payload is oversized: "
                                + "cause={}, sourceCount={}, bytes={}, "
                                + "maxBytes={}",
                        event.cause(),
                        event.sourceEventIds().size(),
                        serializedBytes,
                        maxPublicEventBytes);
                return;
            }
            BestEffortMetricRecorder.increment(
                    "room.inbox.notification.public_event.sources",
                    publicEventSourcesCounter,
                    event.sourceEventIds().size());
            delivery.deliver(userId, connectionId, event);
            BestEffortMetricRecorder.increment(
                    "room.inbox.notification.delivery.success",
                    successCounter);
        } catch (RuntimeException exception) {
            BestEffortMetricRecorder.increment(
                    "room.inbox.notification.delivery.failure",
                    failureCounter);
            log.warn(
                    "Room inbox event delivery failed: cause={}, "
                            + "exceptionClass={}",
                    event.cause(),
                    exception.getClass().getName());
        }
    }
}
