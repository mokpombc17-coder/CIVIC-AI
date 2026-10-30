package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;

import java.time.Instant;
import java.util.Objects;

public record RoomInboxPageEntry(
        Room room,
        Membership membership,
        RoomInboxLastMessage lastMessage,
        Instant lastActivityAt
) {

    public RoomInboxPageEntry {
        Objects.requireNonNull(room, "room");
        Objects.requireNonNull(membership, "membership");
        Objects.requireNonNull(lastActivityAt, "lastActivityAt");
        if (!room.roomId().equals(membership.roomId())) {
            throw new IllegalArgumentException(
                    "Room and membership identity differ");
        }
    }
}
