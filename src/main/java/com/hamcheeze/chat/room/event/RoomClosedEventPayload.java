package com.hamcheeze.chat.room.event;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;

import java.util.Objects;

public record RoomClosedEventPayload(
        String roomId,
        long roomVersion,
        RoomStatus roomStatus,
        RoomMemberState owner
) implements RoomEventPayload {

    public RoomClosedEventPayload {
        roomId = RoomEventValidation.requireRoomId(roomId);
        roomVersion = RoomEventValidation.requireVersion(
                roomVersion,
                "roomVersion");
        Objects.requireNonNull(roomStatus, "roomStatus");
        Objects.requireNonNull(owner, "owner");
        if (roomStatus != RoomStatus.CLOSED
                || owner.role() != MembershipRole.OWNER
                || owner.status() != MembershipStatus.LEFT) {
            throw new IllegalArgumentException(
                    "Invalid Room closed event state");
        }
    }
}
