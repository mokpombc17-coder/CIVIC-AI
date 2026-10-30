package com.hamcheeze.chat.room.event;

import com.hamcheeze.chat.room.RoomStatus;

import java.util.Objects;

public record RoomMemberChangedEventPayload(
        String roomId,
        long roomVersion,
        RoomStatus roomStatus,
        RoomMemberChangedState member
) implements RoomEventPayload {

    public RoomMemberChangedEventPayload {
        roomId = RoomEventValidation.requireRoomId(roomId);
        roomVersion = RoomEventValidation.requireVersion(
                roomVersion,
                "roomVersion");
        Objects.requireNonNull(roomStatus, "roomStatus");
        Objects.requireNonNull(member, "member");
    }
}
