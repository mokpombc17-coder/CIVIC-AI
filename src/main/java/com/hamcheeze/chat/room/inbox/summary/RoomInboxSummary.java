package com.hamcheeze.chat.room.inbox.summary;

import java.time.Instant;
import java.util.Objects;

public record RoomInboxSummary(
        String roomId,
        RoomInboxLastMessage lastMessage,
        Instant lastActivityAt,
        Instant updatedAt
) {

    public RoomInboxSummary {
        if (roomId == null || roomId.isBlank()) {
            throw new IllegalArgumentException(
                    "roomId must not be blank");
        }
        Objects.requireNonNull(lastMessage, "lastMessage");
        Objects.requireNonNull(lastActivityAt, "lastActivityAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
        if (!lastActivityAt.equals(lastMessage.createdAt())) {
            throw new IllegalArgumentException(
                    "lastActivityAt must equal lastMessage.createdAt");
        }
        if (updatedAt.isBefore(lastMessage.createdAt())) {
            throw new IllegalArgumentException(
                    "updatedAt must not precede lastMessage.createdAt");
        }
    }
}
