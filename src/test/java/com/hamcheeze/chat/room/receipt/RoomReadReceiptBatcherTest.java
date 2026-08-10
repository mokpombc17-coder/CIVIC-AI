package com.hamcheeze.chat.room.receipt;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class RoomReadReceiptBatcherTest {

    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-10T03:00:00Z"),
            ZoneOffset.UTC);

    @Test
    void coalescesSameMembershipToMaximumCursorAndSortsUpdates() {
        CapturingDelivery delivery = new CapturingDelivery();
        RoomReadReceiptBatcher batcher = batcher(
                delivery, new RoomReadReceiptProperties());

        batcher.onAdvanced("room-1", "membership-b", 2, 101);
        batcher.onAdvanced("room-1", "membership-b", 2, 105);
        batcher.onAdvanced("room-1", "membership-b", 2, 110);
        batcher.onAdvanced("room-1", "membership-a", 1, 90);
        batcher.flushNow();

        assertThat(delivery.events).hasSize(1);
        RoomReadPositionsAdvancedPayload payload =
                (RoomReadPositionsAdvancedPayload)
                        delivery.events.getFirst().payload();
        assertThat(payload.updates())
                .containsExactly(
                        new RoomReadPositionAdvance(
                                "membership-a", 1, 90),
                        new RoomReadPositionAdvance(
                                "membership-b", 2, 110));
    }

    @Test
    void ignoresLowerVersionAndReplacesWithHigherVersion() {
        CapturingDelivery delivery = new CapturingDelivery();
        RoomReadReceiptBatcher batcher = batcher(
                delivery, new RoomReadReceiptProperties());

        batcher.onAdvanced("room-1", "membership-a", 2, 110);
        batcher.onAdvanced("room-1", "membership-a", 1, 130);
        batcher.onAdvanced("room-1", "membership-a", 3, 90);
        batcher.flushNow();

        RoomReadPositionsAdvancedPayload payload =
                (RoomReadPositionsAdvancedPayload)
                        delivery.events.getFirst().payload();
        assertThat(payload.updates()).containsExactly(
                new RoomReadPositionAdvance(
                        "membership-a", 3, 90));
    }

    @Test
    void separatesRoomsAndSplitsByMaximumUpdates() {
        RoomReadReceiptProperties properties =
                new RoomReadReceiptProperties();
        properties.setMaxUpdatesPerEvent(2);
        CapturingDelivery delivery = new CapturingDelivery();
        RoomReadReceiptBatcher batcher = batcher(
                delivery, properties);

        batcher.onAdvanced("room-1", "membership-a", 1, 10);
        batcher.onAdvanced("room-1", "membership-b", 1, 20);
        batcher.onAdvanced("room-1", "membership-c", 1, 30);
        batcher.onAdvanced("room-2", "membership-z", 1, 40);
        batcher.flushNow();

        assertThat(delivery.events).hasSize(3);
        assertThat(delivery.events.stream()
                .map(event -> event.payload().roomId())
                .toList())
                .containsExactlyInAnyOrder(
                        "room-1", "room-1", "room-2");
        assertThat(delivery.events.stream()
                .filter(event -> event.payload().roomId()
                        .equals("room-1"))
                .map(event -> ((RoomReadPositionsAdvancedPayload)
                        event.payload()).updates().size())
                .toList())
                .containsExactlyInAnyOrder(1, 2);
    }

    @Test
    void publishFailureFallsBackToInvalidationAndClearsDirtyOnSuccess() {
        AtomicBoolean first = new AtomicBoolean(true);
        CapturingDelivery delivery = new CapturingDelivery(event ->
                first.getAndSet(false)
                        ? RoomReadReceiptDeliveryOutcome.FAILED
                        : RoomReadReceiptDeliveryOutcome.ACCEPTED);
        RoomReadReceiptBatcher batcher = batcher(
                delivery, new RoomReadReceiptProperties());

        batcher.onAdvanced("room-1", "membership-a", 1, 10);
        batcher.flushNow();

        assertThat(delivery.events)
                .extracting(RoomReadReceiptEventEnvelope::eventType)
                .containsExactly(
                        RoomReadReceiptEventType
                                .ROOM_READ_POSITIONS_ADVANCED,
                        RoomReadReceiptEventType
                                .ROOM_READ_RECEIPT_STATE_INVALIDATED);
        assertThat(batcher.dirtyRoomCount()).isZero();
    }

    @Test
    void failedInvalidationRemainsDirtyForNextFlush() {
        CapturingDelivery delivery = new CapturingDelivery(event ->
                RoomReadReceiptDeliveryOutcome.FAILED);
        RoomReadReceiptBatcher batcher = batcher(
                delivery, new RoomReadReceiptProperties());

        batcher.onAdvanced("room-1", "membership-a", 1, 10);
        batcher.flushNow();
        assertThat(batcher.dirtyRoomCount()).isOne();

        delivery.outcome = event ->
                RoomReadReceiptDeliveryOutcome.ACCEPTED;
        batcher.flushNow();

        assertThat(batcher.dirtyRoomCount()).isZero();
        assertThat(delivery.events.getLast().eventType())
                .isEqualTo(RoomReadReceiptEventType
                        .ROOM_READ_RECEIPT_STATE_INVALIDATED);
    }

    @Test
    void updateArrivingDuringFlushIsPreservedForNextBatch() {
        AtomicReference<RoomReadReceiptBatcher> reference =
                new AtomicReference<>();
        AtomicBoolean injected = new AtomicBoolean();
        CapturingDelivery delivery = new CapturingDelivery(event -> {
            if (event.eventType() == RoomReadReceiptEventType
                    .ROOM_READ_POSITIONS_ADVANCED
                    && injected.compareAndSet(false, true)) {
                reference.get().onAdvanced(
                        "room-1", "membership-a", 1, 20);
            }
            return RoomReadReceiptDeliveryOutcome.ACCEPTED;
        });
        RoomReadReceiptBatcher batcher = batcher(
                delivery, new RoomReadReceiptProperties());
        reference.set(batcher);

        batcher.onAdvanced("room-1", "membership-a", 1, 10);
        batcher.flushNow();

        assertThat(batcher.pendingRoomCount()).isOne();
        batcher.flushNow();
        List<Long> cursors = delivery.events.stream()
                .map(event -> (RoomReadPositionsAdvancedPayload)
                        event.payload())
                .map(payload -> payload.updates().getFirst()
                        .storedLastReadSequence())
                .toList();
        assertThat(cursors).containsExactly(10L, 20L);
    }

    @Test
    void pendingCapacityOverflowProducesInvalidation() {
        RoomReadReceiptProperties properties =
                new RoomReadReceiptProperties();
        properties.setMaxPendingRooms(1);
        CapturingDelivery delivery = new CapturingDelivery();
        RoomReadReceiptBatcher batcher = batcher(
                delivery, properties);

        batcher.onAdvanced("room-1", "membership-a", 1, 10);
        batcher.onAdvanced("room-2", "membership-b", 1, 20);
        batcher.flushNow();

        assertThat(delivery.events.stream()
                .filter(event -> event.eventType()
                        == RoomReadReceiptEventType
                        .ROOM_READ_RECEIPT_STATE_INVALIDATED)
                .map(event -> event.payload().roomId())
                .toList())
                .containsExactly("room-2");
    }

    private static RoomReadReceiptBatcher batcher(
            RoomReadReceiptDeliveryPort delivery,
            RoomReadReceiptProperties properties
    ) {
        return new RoomReadReceiptBatcher(
                delivery,
                properties,
                new ObjectMapper(),
                CLOCK,
                new SimpleMeterRegistry());
    }

    private static final class CapturingDelivery
            implements RoomReadReceiptDeliveryPort {

        private final List<RoomReadReceiptEventEnvelope> events =
                new ArrayList<>();
        private java.util.function.Function<
                RoomReadReceiptEventEnvelope,
                RoomReadReceiptDeliveryOutcome> outcome;

        private CapturingDelivery() {
            this(event -> RoomReadReceiptDeliveryOutcome.ACCEPTED);
        }

        private CapturingDelivery(
                java.util.function.Function<
                        RoomReadReceiptEventEnvelope,
                        RoomReadReceiptDeliveryOutcome> outcome
        ) {
            this.outcome = outcome;
        }

        @Override
        public RoomReadReceiptDeliveryOutcome publish(
                RoomReadReceiptEventEnvelope event
        ) {
            events.add(event);
            return outcome.apply(event);
        }
    }
}
