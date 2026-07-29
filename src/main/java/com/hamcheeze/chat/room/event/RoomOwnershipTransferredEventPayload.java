package com.hamcheeze.chat.room.event;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;

import java.util.Objects;

public record RoomOwnershipTransferredEventPayload(
        String roomId,
        long roomVersion,
        RoomStatus roomStatus,
        RoomMemberState previousOwner,
        RoomMemberState newOwner
) implements RoomEventPayload {

    public RoomOwnershipTransferredEventPayload {
        roomId = RoomEventValidation.requireRoomId(roomId);
        roomVersion = RoomEventValidation.requireVersion(
                roomVersion,
                "roomVersion");
        Objects.requireNonNull(roomStatus, "roomStatus");
        Objects.requireNonNull(previousOwner, "previousOwner");
        Objects.requireNonNull(newOwner, "newOwner");
        if (roomStatus != RoomStatus.ACTIVE
                || previousOwner.role() != MembershipRole.MEMBER
                || previousOwner.status() != MembershipStatus.ACTIVE
                || newOwner.role() != MembershipRole.OWNER
                || newOwner.status() != MembershipStatus.ACTIVE) {
            throw new IllegalArgumentException(
                    "Invalid ownership transferred event state");
        }
    }
}
