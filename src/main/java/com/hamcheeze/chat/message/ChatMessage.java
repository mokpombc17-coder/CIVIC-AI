package com.hamcheeze.chat.message;

import java.time.Instant;
import java.util.Objects;

public record ChatMessage(
        String messageId,
        String roomId,
        long roomSequence,
        String senderUserId,
        String clientMessageId,
        String content,
        Instant createdAt
) {

    public ChatMessage {
        Objects.requireNonNull(messageId, "messageId");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(senderUserId, "senderUserId");
        Objects.requireNonNull(clientMessageId, "clientMessageId");
        Objects.requireNonNull(content, "content");
        Objects.requireNonNull(createdAt, "createdAt");
        if (roomSequence < 1) {
            throw new IllegalArgumentException(
                    "roomSequence must be at least 1");
        }
    }
}
