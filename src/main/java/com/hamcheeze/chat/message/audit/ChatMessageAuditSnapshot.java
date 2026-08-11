package com.hamcheeze.chat.message.audit;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;

import java.time.Instant;
import java.util.Objects;

public record ChatMessageAuditSnapshot(
        String content,
        MessageState state,
        boolean countable,
        long messageVersion,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {

    public ChatMessageAuditSnapshot {
        Objects.requireNonNull(state, "state");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
        if (messageVersion < 1) {
            throw new IllegalArgumentException(
                    "messageVersion must be at least 1");
        }
        if (state == MessageState.ACTIVE) {
            if (content == null || content.isBlank() || deletedAt != null) {
                throw new IllegalArgumentException(
                        "Active audit snapshot is malformed");
            }
        } else if (state == MessageState.DELETED_BY_AUTHOR) {
            if (content != null
                    || deletedAt == null
                    || !updatedAt.equals(deletedAt)) {
                throw new IllegalArgumentException(
                        "Deleted audit snapshot is malformed");
            }
        } else {
            throw new IllegalArgumentException(
                    "Unsupported audit message state");
        }
    }

    public static ChatMessageAuditSnapshot from(ChatMessage message) {
        Objects.requireNonNull(message, "message");
        return new ChatMessageAuditSnapshot(
                message.content(),
                message.state(),
                message.countable(),
                message.messageVersion(),
                message.createdAt(),
                message.updatedAt(),
                message.deletedAt());
    }
}
