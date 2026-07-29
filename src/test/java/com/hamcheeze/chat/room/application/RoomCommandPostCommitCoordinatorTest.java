package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.application.access.RoomCommandAccessRevocationCoordinator;
import com.hamcheeze.chat.room.application.event.RoomCommandEventPropagationCoordinator;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InOrder;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;

class RoomCommandPostCommitCoordinatorTest {

    private static final String REQUEST_ID =
            "73efcc36-3318-4ec5-8135-8d2e58ff2906";

    @ParameterizedTest
    @EnumSource(
            value = RoomCommandResultCode.class,
            names = {"LEFT", "BANNED", "CLOSED"})
    void propagatesEventBeforeAccessRevocation(
            RoomCommandResultCode code
    ) {
        RoomCommandEventPropagationCoordinator events =
                mock(RoomCommandEventPropagationCoordinator.class);
        RoomCommandAccessRevocationCoordinator access =
                mock(RoomCommandAccessRevocationCoordinator.class);
        RoomCommandPostCommitCoordinator coordinator =
                new RoomCommandPostCommitCoordinator(events, access);
        RoomCommandExecution execution = execution(code);

        coordinator.afterCommand(execution);

        InOrder order = inOrder(events, access);
        order.verify(events).afterCommand(execution);
        order.verify(access).afterCommand(execution);
    }

    @ParameterizedTest
    @EnumSource(
            value = RoomCommandResultCode.class,
            names = {"LEFT", "BANNED", "CLOSED"})
    void propagatesAccessRevocationFailureToCaller(
            RoomCommandResultCode code
    ) {
        RoomCommandEventPropagationCoordinator events =
                mock(RoomCommandEventPropagationCoordinator.class);
        RoomCommandAccessRevocationCoordinator access =
                mock(RoomCommandAccessRevocationCoordinator.class);
        RoomCommandPostCommitCoordinator coordinator =
                new RoomCommandPostCommitCoordinator(events, access);
        RoomCommandExecution execution = execution(code);
        RoomCommandExecutionException failure =
                new RoomCommandExecutionException(
                        RoomCommandFailureKind.ACCESS_REVOCATION_FAILED,
                        "revocation failed");
        doThrow(failure).when(access).afterCommand(execution);

        assertThatThrownBy(() -> coordinator.afterCommand(execution))
                .isSameAs(failure);

        InOrder order = inOrder(events, access);
        order.verify(events).afterCommand(execution);
        order.verify(access).afterCommand(execution);
    }

    private static RoomCommandExecution execution(
            RoomCommandResultCode code
    ) {
        RoomCommandResult result = switch (code) {
            case LEFT -> new RoomCommandResult(
                    RoomCommandType.LEAVE_ROOM,
                    code,
                    "room-1",
                    "membership-1",
                    "user-1",
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
            case BANNED -> new RoomCommandResult(
                    RoomCommandType.BAN_MEMBER,
                    code,
                    "room-1",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    "user-1",
                    "membership-1",
                    4L,
                    3L,
                    null,
                    null,
                    null);
            case CLOSED -> new RoomCommandResult(
                    RoomCommandType.CLOSE_ROOM,
                    code,
                    "room-1",
                    null,
                    null,
                    "owner-membership",
                    "owner-1",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    5L,
                    null,
                    4L,
                    null,
                    null);
            default -> throw new IllegalArgumentException();
        };
        return new RoomCommandExecution(REQUEST_ID, result, false);
    }
}
