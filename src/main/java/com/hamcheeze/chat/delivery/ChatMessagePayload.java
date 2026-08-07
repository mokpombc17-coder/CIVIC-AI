package com.hamcheeze.chat.delivery;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;

import java.time.Instant;
import java.util.Objects;

public record ChatMessagePayload(
        String messageId,
        String roomId,
        long roomSequence,
        String senderMembershipId,
        String clientMessageId,
        String content,
        MessageState state,
        boolean countable,
        long messageVersion,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {

    public ChatMessagePayload {
        requireText(messageId, "messageId");
        requireText(roomId, "roomId");
        requireText(senderMembershipId, "senderMembershipId");
        requireText(clientMessageId, "clientMessageId");
        Objects.requireNonNull(state, "state");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
        if (roomSequence < 1) {
            throw new IllegalArgumentException(
                    "roomSequence must be at least 1");
        }
        if (messageVersion < 1) {
            throw new IllegalArgumentException(
                    "messageVersion must be at least 1");
        }
        if (updatedAt.isBefore(createdAt)) {
            throw new IllegalArgumentException(
                    "updatedAt must not precede createdAt");
        }
        if (state == MessageState.ACTIVE) {
            if (content == null || content.isBlank()) {
                throw new IllegalArgumentException(
                        "ACTIVE message content must not be blank");
            }
            if (deletedAt != null) {
                throw new IllegalArgumentException(
                        "ACTIVE message deletedAt must be null");
            }
        } else {
            if (content != null) {
                throw new IllegalArgumentException(
                        "Deleted message content must be null");
            }
            if (deletedAt == null || !updatedAt.equals(deletedAt)) {
                throw new IllegalArgumentException(
                        "Deleted message timestamps must match");
            }
            if (messageVersion < 2) {
                throw new IllegalArgumentException(
                        "Deleted messageVersion must be at least 2");
            }
        }
    }

    public ChatMessagePayload(
            String messageId,
            String roomId,
            long roomSequence,
            String senderMembershipId,
            String clientMessageId,
            String content,
            MessageState state,
            long messageVersion,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt
    ) {
        this(
                messageId,
                roomId,
                roomSequence,
                senderMembershipId,
                clientMessageId,
                content,
                state,
                true,
                messageVersion,
                createdAt,
                updatedAt,
                deletedAt);
    }

    public ChatMessagePayload(
            String messageId,
            String roomId,
            long roomSequence,
            String senderMembershipId,
            String clientMessageId,
            String content,
            Instant createdAt
    ) {
        this(
                messageId,
                roomId,
                roomSequence,
                senderMembershipId,
                clientMessageId,
                content,
                MessageState.ACTIVE,
                true,
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
                message.senderMembershipId(),
                message.clientMessageId(),
                message.content(),
                message.state(),
                message.countable(),
                message.messageVersion(),
                message.createdAt(),
                message.updatedAt(),
                message.deletedAt());
    }

    private static void requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
    }
}
