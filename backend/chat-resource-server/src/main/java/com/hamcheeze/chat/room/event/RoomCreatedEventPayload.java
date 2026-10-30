package com.hamcheeze.chat.room.event;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;

import java.util.Objects;

public record RoomCreatedEventPayload(
        String roomId,
        long roomVersion,
        RoomStatus roomStatus,
        RoomMemberState owner
) implements RoomEventPayload {

    public RoomCreatedEventPayload {
        roomId = RoomEventValidation.requireRoomId(roomId);
        roomVersion = RoomEventValidation.requireVersion(
                roomVersion,
                "roomVersion");
        Objects.requireNonNull(roomStatus, "roomStatus");
        Objects.requireNonNull(owner, "owner");
        if (roomStatus != RoomStatus.ACTIVE
                || owner.role() != MembershipRole.OWNER
                || owner.status() != MembershipStatus.ACTIVE) {
            throw new IllegalArgumentException(
                    "Invalid Room created event state");
        }
    }
}
