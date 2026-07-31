package com.hamcheeze.chat.delivery;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;

import java.time.Instant;
import java.util.Objects;

public record ChatMessagePayload(
        String messageId,
        String roomId,
        long roomSequence,
        String senderUserId,
        String clientMessageId,
        String content,
        MessageState state,
        long messageVersion,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {

    public ChatMessagePayload {
        new ChatMessage(
                messageId,
                roomId,
                roomSequence,
                senderUserId,
                clientMessageId,
                content,
                state,
                messageVersion,
                createdAt,
                updatedAt,
                deletedAt);
    }

    public ChatMessagePayload(
            String messageId,
            String roomId,
            long roomSequence,
            String senderUserId,
            String clientMessageId,
            String content,
            Instant createdAt
    ) {
        this(
                messageId,
                roomId,
                roomSequence,
                senderUserId,
                clientMessageId,
                content,
                MessageState.ACTIVE,
                1,
                createdAt,
                createdAt,
                null);
    }

    public static ChatMessagePayload from(ChatMessage message) {
        Objects.requireNonNull(message, "message");
        return new ChatMessagePayload(
                message.messageId(),
                message.roomId(),
                message.roomSequence(),
                message.senderUserId(),
                message.clientMessageId(),
                message.content(),
                message.state(),
                message.messageVersion(),
                message.createdAt(),
                message.updatedAt(),
                message.deletedAt());
    }
}
