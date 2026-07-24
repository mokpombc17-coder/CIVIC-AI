package com.hamcheeze.chat.delivery;

import com.hamcheeze.chat.message.ChatMessage;

import java.time.Instant;
import java.util.Objects;

public record ChatMessagePayload(
        String messageId,
        String roomId,
        long roomSequence,
        String clientMessageId,
        String content,
        Instant createdAt
) {

    public ChatMessagePayload {
        Objects.requireNonNull(messageId, "messageId");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(clientMessageId, "clientMessageId");
        Objects.requireNonNull(content, "content");
        Objects.requireNonNull(createdAt, "createdAt");
    }

    public static ChatMessagePayload from(ChatMessage message) {
        Objects.requireNonNull(message, "message");
        return new ChatMessagePayload(
                message.messageId(),
                message.roomId(),
                message.roomSequence(),
                message.clientMessageId(),
                message.content(),
                message.createdAt());
    }
}
