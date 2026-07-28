package com.hamcheeze.chat.room.authorization;

import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;

import java.util.Objects;

public record RoomAccessSnapshot(
        String roomId,
        RoomStatus roomStatus,
        long roomVersion,
        MembershipStatus membershipStatus,
        Long membershipVersion,
        RoomAccessState state
) {

    public RoomAccessSnapshot {
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(state, "state");
    }

    public static RoomAccessSnapshot roomNotFound(String roomId) {
        return new RoomAccessSnapshot(
                roomId,
                null,
                -1,
                null,
                null,
                RoomAccessState.ROOM_NOT_FOUND);
    }

    public boolean semanticallyValid() {
        return switch (state) {
            case ROOM_NOT_FOUND ->
                    roomStatus == null
                            && roomVersion == -1
                            && membershipStatus == null
                            && membershipVersion == null;
            case ROOM_CLOSED ->
                    roomStatus == RoomStatus.CLOSED
                            && roomVersion >= 0
                            && membershipStatus == null
                            && membershipVersion == null;
            case MEMBERSHIP_NOT_FOUND ->
                    roomStatus == RoomStatus.ACTIVE
                            && roomVersion >= 0
                            && membershipStatus == null
                            && membershipVersion == null;
            case ACTIVE_MEMBER ->
                    validMembership(RoomStatus.ACTIVE,
                            MembershipStatus.ACTIVE);
            case MEMBERSHIP_LEFT ->
                    validMembership(RoomStatus.ACTIVE,
                            MembershipStatus.LEFT);
            case MEMBERSHIP_BANNED ->
                    validMembership(RoomStatus.ACTIVE,
                            MembershipStatus.BANNED);
        };
    }

    private boolean validMembership(
            RoomStatus expectedRoomStatus,
            MembershipStatus expectedMembershipStatus
    ) {
        return roomStatus == expectedRoomStatus
                && roomVersion >= 0
                && membershipStatus == expectedMembershipStatus
                && membershipVersion != null
                && membershipVersion >= 0;
    }
}
