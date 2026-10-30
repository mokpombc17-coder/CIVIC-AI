package com.hamcheeze.chat.room.query;

import java.time.Instant;
import java.util.Objects;

public record ListedRoomPosition(
        Instant createdAt,
        String roomId
) {

    public ListedRoomPosition {
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(roomId, "roomId");
    }
}
