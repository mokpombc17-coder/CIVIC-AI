package com.hamcheeze.chat.room.application.event;

import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.event.RoomEventEnvelope;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class RoomCommandEventPropagationCoordinatorTest {

    private static final String REQUEST_ID =
            "73efcc36-3318-4ec5-8135-8d2e58ff2906";
    private static final String EVENT_ID =
            "550e8400-e29b-41d4-a716-446655440000";
    private static final Instant EMITTED_AT =
            Instant.parse("2026-07-28T10:00:00Z");

    @Test
    void publishesOneEnvelopeToRoomAndEveryDistinctRecipient() {
        RecordingPort port = new RecordingPort();
        RoomCommandEventPropagationCoordinator coordinator =
                coordinator(port, () -> EVENT_ID);

        coordinator.afterCommand(ownershipExecution(false));

        assertThat(port.roomEvents).hasSize(1);
        assertThat(port.userDeliveries)
                .extracting(UserDelivery::userId)
                .containsExactlyInAnyOrder("owner-1", "owner-2");
        assertThat(port.userDeliveries)
                .allSatisfy(delivery -> assertThat(delivery.event())
                        .isSameAs(port.roomEvents.getFirst()));
        assertThat(port.roomEvents.getFirst().eventId())
                .isEqualTo(EVENT_ID);
    }

    @Test
    void isolatesRoomAndIndividualUserDeliveryFailures() {
        RecordingPort port = new RecordingPort();
        port.throwOnRoom = true;
        port.throwForUser = "owner-1";
        RoomCommandEventPropagationCoordinator coordinator =
                coordinator(port, () -> EVENT_ID);

        assertThatCode(() -> coordinator.afterCommand(
                ownershipExecution(false))).doesNotThrowAnyException();

        assertThat(port.roomAttempts).isEqualTo(1);
        assertThat(port.userAttempts).isEqualTo(2);
        assertThat(port.userDeliveries)
                .extracting(UserDelivery::userId)
                .containsExactly("owner-2");
    }

    @Test
    void isolatesMappingFailure() {
        RecordingPort port = new RecordingPort();
        RoomCommandEventPropagationCoordinator coordinator =
                coordinator(port, () -> "invalid-event-id");

        assertThatCode(() -> coordinator.afterCommand(
                ownershipExecution(false))).doesNotThrowAnyException();
        assertThat(port.roomAttempts).isZero();
        assertThat(port.userAttempts).isZero();
    }

    @Test
    void skipsReplayNoOpAndRejectionBeforeGeneratingEventId() {
        RecordingPort port = new RecordingPort();
        AtomicInteger generatedIds = new AtomicInteger();
        RoomCommandEventPropagationCoordinator coordinator =
                coordinator(port, () -> {
                    generatedIds.incrementAndGet();
                    return EVENT_ID;
                });

        coordinator.afterCommand(ownershipExecution(true));
        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                alreadyActive(),
                false));
        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                RoomCommandResult.rejection(
                        RoomCommandType.JOIN_ROOM,
                        RoomCommandResultCode.ROOM_CLOSED,
                        "room-1",
                        null),
                false));

        assertThat(generatedIds).hasValue(0);
        assertThat(port.roomAttempts).isZero();
        assertThat(port.userAttempts).isZero();
    }

    private static RoomCommandEventPropagationCoordinator coordinator(
            RoomEventDeliveryPort port,
            RoomEventIdGenerator idGenerator
    ) {
        return new RoomCommandEventPropagationCoordinator(
                new RoomCommandEventMapper(),
                idGenerator,
                Clock.fixed(EMITTED_AT, ZoneOffset.UTC),
                port);
    }

    private static RoomCommandExecution ownershipExecution(
            boolean replayed
    ) {
        return new RoomCommandExecution(
                REQUEST_ID,
                new RoomCommandResult(
                        RoomCommandType.TRANSFER_OWNERSHIP,
                        RoomCommandResultCode.OWNERSHIP_TRANSFERRED,
                        "room-1",
                        null,
                        null,
                        null,
                        null,
                        "owner-1",
                        "owner-2",
                        "membership-1",
                        "membership-2",
                        null,
                        null,
                        4L,
                        null,
                        null,
                        3L,
                        2L),
                replayed);
    }

    private static RoomCommandResult alreadyActive() {
        return new RoomCommandResult(
                RoomCommandType.JOIN_ROOM,
                RoomCommandResultCode.ALREADY_ACTIVE,
                "room-1",
                "membership-1",
                "member-1",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                4L,
                3L,
                null,
                null,
                null);
    }

    private static final class RecordingPort
            implements RoomEventDeliveryPort {

        private final List<RoomEventEnvelope> roomEvents =
                new ArrayList<>();
        private final List<UserDelivery> userDeliveries =
                new ArrayList<>();
        private int roomAttempts;
        private int userAttempts;
        private boolean throwOnRoom;
        private String throwForUser;

        @Override
        public RoomEventDeliveryOutcome publishToRoom(
                RoomEventEnvelope event
        ) {
            roomAttempts++;
            if (throwOnRoom) {
                throw new IllegalStateException("room delivery failed");
            }
            roomEvents.add(event);
            return RoomEventDeliveryOutcome.ACCEPTED;
        }

        @Override
        public RoomEventDeliveryOutcome publishToUser(
                String userId,
                RoomEventEnvelope event
        ) {
            userAttempts++;
            if (userId.equals(throwForUser)) {
                throw new IllegalStateException("user delivery failed");
            }
            userDeliveries.add(new UserDelivery(userId, event));
            return RoomEventDeliveryOutcome.ACCEPTED;
        }
    }

    private record UserDelivery(
            String userId,
            RoomEventEnvelope event
    ) {
    }
}
