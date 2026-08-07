package com.hamcheeze.chat.room.application.access;

import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.room.authorization.RoomAccessSnapshot;
import com.hamcheeze.chat.room.authorization.RoomAccessState;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;

public final class RoomCommandAccessRevocationCoordinator {

    private static final Logger log = LoggerFactory.getLogger(
            RoomCommandAccessRevocationCoordinator.class);

    private final RoomAccessReader accessReader;
    private final RoomAccessRevocationPort revocationPort;

    public RoomCommandAccessRevocationCoordinator(
            RoomAccessReader accessReader,
            RoomAccessRevocationPort revocationPort
    ) {
        this.accessReader =
                Objects.requireNonNull(accessReader, "accessReader");
        this.revocationPort =
                Objects.requireNonNull(revocationPort, "revocationPort");
    }

    public static RoomCommandAccessRevocationCoordinator disabled() {
        return new RoomCommandAccessRevocationCoordinator(
                (userId, roomId) -> new RoomAccessSnapshot(
                        roomId,
                        RoomStatus.ACTIVE,
                        0,
                        "disabled-membership",
                        MembershipStatus.ACTIVE,
                        0L,
                        0L,
                        RoomAccessState.ACTIVE_MEMBER),
                new RoomAccessRevocationPort() {
                    @Override
                    public RoomAccessRevocationSummary
                    revokeUserRoomAccess(
                            String userId,
                            String roomId,
                            RoomAccessRevocationReason reason
                    ) {
                        return RoomAccessRevocationSummary.noOp();
                    }

                    @Override
                    public RoomAccessRevocationSummary revokeRoomAccess(
                            String roomId,
                            RoomAccessRevocationReason reason
                    ) {
                        return RoomAccessRevocationSummary.noOp();
                    }

                    @Override
                    public RoomAccessRevocationSummary
                    revokeStaleUserRoomAccess(
                            String userId,
                            String roomId,
                            long currentMessageVisibleAfterSequence,
                            RoomAccessRevocationReason reason
                    ) {
                        return RoomAccessRevocationSummary.noOp();
                    }
                });
    }

    public void afterCommand(RoomCommandExecution execution) {
        RoomCommandResult result = execution.result();
        try {
            RoomAccessRevocationSummary summary =
                    switch (result.code()) {
                        case LEFT, ALREADY_LEFT ->
                                revokeUserIfStillDenied(
                                        result.membershipUserId(),
                                        result.roomId(),
                                        RoomAccessRevocationReason
                                                .MEMBERSHIP_LEFT);
                        case BANNED, ALREADY_BANNED ->
                                revokeUserIfStillDenied(
                                        result.targetUserId(),
                                        result.roomId(),
                                        RoomAccessRevocationReason
                                                .MEMBERSHIP_BANNED);
                        case REJOINED ->
                                revokeStaleAfterRejoin(
                                        result.membershipUserId(),
                                        result.roomId());
                        case CLOSED, ALREADY_CLOSED ->
                                revocationPort.revokeRoomAccess(
                                        result.roomId(),
                                        RoomAccessRevocationReason
                                                .ROOM_CLOSED);
                        default -> RoomAccessRevocationSummary.noOp();
                    };
            if (summary.failedConnections() > 0) {
                throw new RoomAccessRevocationException(
                        "One or more WebSocket connections could not be closed");
            }
        } catch (RoomCommandExecutionException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new RoomCommandExecutionException(
                    RoomCommandFailureKind.ACCESS_REVOCATION_FAILED,
                    "Room access revocation failed after command commit",
                    exception);
        }
    }

    private RoomAccessRevocationSummary revokeUserIfStillDenied(
            String userId,
            String roomId,
            RoomAccessRevocationReason reason
    ) {
        RoomAccessSnapshot snapshot =
                readAccessOrNull(userId, roomId, reason);
        if (snapshot == null) {
            return revocationPort.revokeUserRoomAccess(
                    userId,
                    roomId,
                    reason);
        }
        if (snapshot.state() == RoomAccessState.ACTIVE_MEMBER) {
            return revocationPort.revokeStaleUserRoomAccess(
                    userId,
                    roomId,
                    snapshot.messageVisibleAfterSequence(),
                    reason);
        }
        return revocationPort.revokeUserRoomAccess(
                userId,
                roomId,
                reason);
    }

    private RoomAccessRevocationSummary revokeStaleAfterRejoin(
            String userId,
            String roomId
    ) {
        RoomAccessRevocationReason reason =
                RoomAccessRevocationReason.MEMBERSHIP_REJOINED;
        RoomAccessSnapshot snapshot =
                readAccessOrNull(userId, roomId, reason);
        if (snapshot == null) {
            return revocationPort.revokeUserRoomAccess(
                    userId,
                    roomId,
                    reason);
        }
        if (snapshot.state() != RoomAccessState.ACTIVE_MEMBER) {
            return revocationPort.revokeUserRoomAccess(
                    userId,
                    roomId,
                    reason);
        }
        return revocationPort.revokeStaleUserRoomAccess(
                userId,
                roomId,
                snapshot.messageVisibleAfterSequence(),
                reason);
    }

    private RoomAccessSnapshot readAccessOrNull(
            String userId,
            String roomId,
            RoomAccessRevocationReason reason
    ) {
        try {
            RoomAccessSnapshot snapshot =
                    accessReader.readAccess(userId, roomId);
            if (snapshot == null) {
                logSnapshotFallback(
                        userId,
                        roomId,
                        reason,
                        "null_snapshot",
                        null);
                return null;
            }
            if (!snapshot.semanticallyValid()) {
                logSnapshotFallback(
                        userId,
                        roomId,
                        reason,
                        "invalid_snapshot",
                        null);
                return null;
            }
            return snapshot;
        } catch (RuntimeException exception) {
            logSnapshotFallback(
                    userId,
                    roomId,
                    reason,
                    "read_failure",
                    exception);
            return null;
        }
    }

    private static void logSnapshotFallback(
            String userId,
            String roomId,
            RoomAccessRevocationReason reason,
            String fallbackCause,
            RuntimeException exception
    ) {
        try {
            log.warn(
                    "Room access snapshot unavailable; falling back to full user-room revocation: "
                            + "userId={}, roomId={}, reason={}, fallbackCause={}, exceptionClass={}",
                    userId,
                    roomId,
                    reason,
                    fallbackCause,
                    exception == null
                            ? "none"
                            : exception.getClass().getName());
        } catch (RuntimeException ignored) {
            // Observability must not prevent fail-closed access revocation.
        }
    }
}
