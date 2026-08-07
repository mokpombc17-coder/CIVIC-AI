package com.hamcheeze.chat.room.application.access;

import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.room.authorization.RoomAccessSnapshot;
import com.hamcheeze.chat.room.authorization.RoomAccessState;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RoomCommandAccessRevocationCoordinatorTest {

    private static final String REQUEST_ID =
            "550e8400-e29b-41d4-a716-446655440000";

    private final RoomAccessReader reader =
            mock(RoomAccessReader.class);
    private final RoomAccessRevocationPort port =
            mock(RoomAccessRevocationPort.class);
    private final RoomCommandAccessRevocationCoordinator coordinator =
            new RoomCommandAccessRevocationCoordinator(reader, port);

    @Test
    void replayedLeaveRevokesOnlyStaleAccessAfterRejoin() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(active());
        when(port.revokeStaleUserRoomAccess(
                "user-1",
                "room-1",
                10L,
                RoomAccessRevocationReason.MEMBERSHIP_LEFT))
                .thenReturn(RoomAccessRevocationSummary.noOp());

        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                membershipResult(RoomCommandResultCode.LEFT),
                true));

        verify(port).revokeStaleUserRoomAccess(
                "user-1",
                "room-1",
                10L,
                RoomAccessRevocationReason.MEMBERSHIP_LEFT);
    }

    @Test
    void replayedBanRevokesOnlyStaleAccessAfterRejoin() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(active());
        when(port.revokeStaleUserRoomAccess(
                "user-1",
                "room-1",
                10L,
                RoomAccessRevocationReason.MEMBERSHIP_BANNED))
                .thenReturn(RoomAccessRevocationSummary.noOp());

        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                targetResult(RoomCommandResultCode.BANNED),
                true));

        verify(port).revokeStaleUserRoomAccess(
                "user-1",
                "room-1",
                10L,
                RoomAccessRevocationReason.MEMBERSHIP_BANNED);
    }

    @Test
    void rejoinedResultRevokesStaleAccessAgainstCurrentBoundary() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(active());
        when(port.revokeStaleUserRoomAccess(
                "user-1",
                "room-1",
                10L,
                RoomAccessRevocationReason.MEMBERSHIP_REJOINED))
                .thenReturn(RoomAccessRevocationSummary.noOp());

        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                rejoinedResult(),
                false));

        verify(port).revokeStaleUserRoomAccess(
                "user-1",
                "room-1",
                10L,
                RoomAccessRevocationReason.MEMBERSHIP_REJOINED);
    }

    @Test
    void failedStaleCloseAfterRejoinIsRetryable() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(active());
        when(port.revokeStaleUserRoomAccess(
                "user-1",
                "room-1",
                10L,
                RoomAccessRevocationReason.MEMBERSHIP_REJOINED))
                .thenReturn(new RoomAccessRevocationSummary(1, 0, 0, 1));

        assertThatThrownBy(() -> coordinator.afterCommand(
                new RoomCommandExecution(
                        REQUEST_ID,
                        rejoinedResult(),
                        false)))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> {
                            assertThat(exception.kind()).isEqualTo(
                                    RoomCommandFailureKind
                                            .ACCESS_REVOCATION_FAILED);
                            assertThat(exception.retryable()).isTrue();
                        });
    }

    @Test
    void deniedCurrentStateRevokesAndFailedCloseIsRetryable() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(left());
        when(port.revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_LEFT))
                .thenReturn(new RoomAccessRevocationSummary(1, 0, 0, 1));

        assertThatThrownBy(() -> coordinator.afterCommand(
                new RoomCommandExecution(
                        REQUEST_ID,
                        membershipResult(RoomCommandResultCode.LEFT),
                        false)))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> {
                            assertThat(exception.kind()).isEqualTo(
                                    RoomCommandFailureKind
                                            .ACCESS_REVOCATION_FAILED);
                            assertThat(exception.retryable()).isTrue();
                        });
    }

    @Test
    void bannedCurrentStateUsesFullRevocation() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(banned());
        when(port.revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_BANNED))
                .thenReturn(RoomAccessRevocationSummary.noOp());

        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                targetResult(RoomCommandResultCode.BANNED),
                false));

        verify(port).revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_BANNED);
    }

    @Test
    void leftReadFailureFallsBackToSuccessfulFullRevocation() {
        when(reader.readAccess("user-1", "room-1"))
                .thenThrow(new IllegalStateException("mongo unavailable"));
        when(port.revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_LEFT))
                .thenReturn(new RoomAccessRevocationSummary(1, 1, 0, 0));

        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                membershipResult(RoomCommandResultCode.LEFT),
                false));

        verify(port).revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_LEFT);
        verify(port, never()).revokeStaleUserRoomAccess(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void bannedReadFailureFallsBackToFullRevocation() {
        when(reader.readAccess("user-1", "room-1"))
                .thenThrow(new IllegalStateException("mongo unavailable"));
        when(port.revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_BANNED))
                .thenReturn(RoomAccessRevocationSummary.noOp());

        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                targetResult(RoomCommandResultCode.BANNED),
                false));

        verify(port).revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_BANNED);
    }

    @Test
    void rejoinedReadFailureFallsBackToFullRevocation() {
        when(reader.readAccess("user-1", "room-1"))
                .thenThrow(new IllegalStateException("mongo unavailable"));
        when(port.revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_REJOINED))
                .thenReturn(RoomAccessRevocationSummary.noOp());

        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                rejoinedResult(),
                false));

        verify(port).revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_REJOINED);
    }

    @Test
    void nullSnapshotFallsBackToFullRevocationAndNoMatchSucceeds() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(null);
        when(port.revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_LEFT))
                .thenReturn(RoomAccessRevocationSummary.noOp());

        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                membershipResult(RoomCommandResultCode.LEFT),
                false));

        verify(port).revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_LEFT);
    }

    @Test
    void semanticallyInvalidSnapshotFallsBackToFullRevocation() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(invalidActive());
        when(port.revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_LEFT))
                .thenReturn(RoomAccessRevocationSummary.noOp());

        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                membershipResult(RoomCommandResultCode.LEFT),
                false));

        verify(port).revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_LEFT);
    }

    @Test
    void failedFallbackCloseIsRetryable() {
        when(reader.readAccess("user-1", "room-1"))
                .thenThrow(new IllegalStateException("mongo unavailable"));
        when(port.revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_LEFT))
                .thenReturn(new RoomAccessRevocationSummary(1, 0, 0, 1));

        assertThatThrownBy(() -> coordinator.afterCommand(
                new RoomCommandExecution(
                        REQUEST_ID,
                        membershipResult(RoomCommandResultCode.LEFT),
                        false)))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> {
                            assertThat(exception.kind()).isEqualTo(
                                    RoomCommandFailureKind
                                            .ACCESS_REVOCATION_FAILED);
                            assertThat(exception.retryable()).isTrue();
                        });
    }

    @Test
    void staleRevocationFailureIsNotRetriedAsSnapshotFallback() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(active());
        when(port.revokeStaleUserRoomAccess(
                "user-1",
                "room-1",
                10L,
                RoomAccessRevocationReason.MEMBERSHIP_LEFT))
                .thenThrow(new IllegalStateException("close failed"));

        assertThatThrownBy(() -> coordinator.afterCommand(
                new RoomCommandExecution(
                        REQUEST_ID,
                        membershipResult(RoomCommandResultCode.LEFT),
                        false)))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> {
                            assertThat(exception.kind()).isEqualTo(
                                    RoomCommandFailureKind
                                            .ACCESS_REVOCATION_FAILED);
                            assertThat(exception.getCause())
                                    .isInstanceOf(
                                            IllegalStateException.class);
                        });
        verify(port, never()).revokeUserRoomAccess(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void closeAlwaysUsesRoomWideRevocation() {
        when(port.revokeRoomAccess(
                "room-1",
                RoomAccessRevocationReason.ROOM_CLOSED))
                .thenReturn(RoomAccessRevocationSummary.noOp());

        coordinator.afterCommand(new RoomCommandExecution(
                REQUEST_ID,
                closedResult(),
                true));

        verify(port).revokeRoomAccess(
                "room-1",
                RoomAccessRevocationReason.ROOM_CLOSED);
    }

    private static RoomAccessSnapshot active() {
        return new RoomAccessSnapshot(
                "room-1",
                RoomStatus.ACTIVE,
                3,
                "membership-1",
                MembershipStatus.ACTIVE,
                2L,
                10L,
                RoomAccessState.ACTIVE_MEMBER);
    }

    private static RoomAccessSnapshot left() {
        return new RoomAccessSnapshot(
                "room-1",
                RoomStatus.ACTIVE,
                4,
                "membership-1",
                MembershipStatus.LEFT,
                3L,
                10L,
                RoomAccessState.MEMBERSHIP_LEFT);
    }

    private static RoomAccessSnapshot banned() {
        return new RoomAccessSnapshot(
                "room-1",
                RoomStatus.ACTIVE,
                4,
                "membership-1",
                MembershipStatus.BANNED,
                3L,
                10L,
                RoomAccessState.MEMBERSHIP_BANNED);
    }

    private static RoomAccessSnapshot invalidActive() {
        return new RoomAccessSnapshot(
                "room-1",
                RoomStatus.ACTIVE,
                3,
                "membership-1",
                MembershipStatus.ACTIVE,
                2L,
                null,
                RoomAccessState.ACTIVE_MEMBER);
    }

    private static RoomCommandResult membershipResult(
            RoomCommandResultCode code
    ) {
        return new RoomCommandResult(
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
    }

    private static RoomCommandResult closedResult() {
        return new RoomCommandResult(
                RoomCommandType.CLOSE_ROOM,
                RoomCommandResultCode.CLOSED,
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
    }

    private static RoomCommandResult rejoinedResult() {
        return new RoomCommandResult(
                RoomCommandType.JOIN_ROOM,
                RoomCommandResultCode.REJOINED,
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
    }

    private static RoomCommandResult targetResult(
            RoomCommandResultCode code
    ) {
        return new RoomCommandResult(
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
    }
}
