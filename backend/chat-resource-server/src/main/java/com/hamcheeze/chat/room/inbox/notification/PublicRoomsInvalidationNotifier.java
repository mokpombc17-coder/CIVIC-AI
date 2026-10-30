package com.hamcheeze.chat.room.inbox.notification;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.room.application.event.PublicRoomListInvalidationPort;
import com.hamcheeze.chat.room.inbox.RoomInboxProperties;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;

import java.time.Clock;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Broadcasts a payload-free {@link PublicRoomsInvalidatedEvent} to every
 * active connection. Requests arriving within one coalescing window collapse
 * into a single broadcast. Delivery is non-durable best-effort.
 */
public final class PublicRoomsInvalidationNotifier
        implements PublicRoomListInvalidationPort, SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(
            PublicRoomsInvalidationNotifier.class);

    private final ActiveConnectionRegistry activeConnections;
    private final PublicRoomsInvalidatedEventDelivery delivery;
    private final long coalescingWindowMs;
    private final long shutdownDrainTimeoutMs;
    private final Clock clock;
    private final AtomicBoolean pending = new AtomicBoolean();
    private final Semaphore signal = new Semaphore(0);
    private final AtomicBoolean running = new AtomicBoolean();
    private final Counter requestedCounter;
    private final Counter broadcastCounter;
    private final Counter successCounter;
    private final Counter failureCounter;
    private volatile Thread worker;

    public PublicRoomsInvalidationNotifier(
            ActiveConnectionRegistry activeConnections,
            PublicRoomsInvalidatedEventDelivery delivery,
            RoomInboxProperties inboxProperties,
            Clock clock,
            MeterRegistry meterRegistry
    ) {
        this.activeConnections = Objects.requireNonNull(
                activeConnections, "activeConnections");
        this.delivery = Objects.requireNonNull(delivery, "delivery");
        RoomInboxProperties.Notification properties = Objects.requireNonNull(
                inboxProperties, "inboxProperties").getNotification();
        this.coalescingWindowMs =
                properties.getPublicRoomsCoalescingWindowMs();
        this.shutdownDrainTimeoutMs =
                properties.getShutdownDrainTimeoutMs();
        this.clock = Objects.requireNonNull(clock, "clock");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.requestedCounter = meterRegistry.counter(
                "room.public_rooms.invalidation.requested");
        this.broadcastCounter = meterRegistry.counter(
                "room.public_rooms.invalidation.broadcast");
        this.successCounter = meterRegistry.counter(
                "room.public_rooms.invalidation.delivery.success");
        this.failureCounter = meterRegistry.counter(
                "room.public_rooms.invalidation.delivery.failure");
    }

    @Override
    public void requestInvalidation() {
        try {
            BestEffortMetricRecorder.increment(
                    "room.public_rooms.invalidation.requested",
                    requestedCounter);
            if (pending.compareAndSet(false, true)) {
                signal.release();
            }
        } catch (RuntimeException exception) {
            // Notification failure must not affect command processing.
        }
    }

    @Override
    public void start() {
        if (!running.compareAndSet(false, true)) {
            return;
        }
        worker = Thread.ofPlatform()
                .name("public-rooms-invalidation")
                .start(this::runWorker);
    }

    @Override
    public void stop(Runnable callback) {
        running.set(false);
        Thread current = worker;
        if (current != null) {
            current.interrupt();
            try {
                current.join(shutdownDrainTimeoutMs);
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
        return RoomInboxNotificationPipeline.LIFECYCLE_PHASE;
    }

    private void runWorker() {
        while (running.get()) {
            try {
                signal.acquire();
                Thread.sleep(coalescingWindowMs);
            } catch (InterruptedException exception) {
                if (!running.get()) {
                    return;
                }
                continue;
            }
            // Clear before the snapshot so a later change triggers another
            // broadcast instead of being absorbed by this one.
            pending.set(false);
            broadcast();
        }
    }

    void broadcast() {
        try {
            PublicRoomsInvalidatedEvent event =
                    PublicRoomsInvalidatedEvent.create(
                            UUID.randomUUID().toString(),
                            clock.instant());
            Map<String, String> recipients =
                    activeConnections.connectionIdsByUser();
            BestEffortMetricRecorder.increment(
                    "room.public_rooms.invalidation.broadcast",
                    broadcastCounter);
            for (Map.Entry<String, String> recipient
                    : recipients.entrySet()) {
                deliver(recipient.getKey(), recipient.getValue(), event);
            }
        } catch (RuntimeException exception) {
            log.warn(
                    "Public rooms invalidation broadcast failed: "
                            + "exceptionClass={}",
                    exception.getClass().getName());
        }
    }

    private void deliver(
            String userId,
            String connectionId,
            PublicRoomsInvalidatedEvent event
    ) {
        try {
            delivery.deliver(userId, connectionId, event);
            BestEffortMetricRecorder.increment(
                    "room.public_rooms.invalidation.delivery.success",
                    successCounter);
        } catch (RuntimeException exception) {
            BestEffortMetricRecorder.increment(
                    "room.public_rooms.invalidation.delivery.failure",
                    failureCounter);
        }
    }
}
