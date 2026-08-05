package com.hamcheeze.chat.room.inbox.summary;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;

import java.time.Instant;
import java.util.Objects;

public record RoomInboxLastMessage(
        String messageId,
        long roomSequence,
        long messageVersion,
        MessageState state,
        String preview,
        boolean previewTruncated,
        Instant createdAt
) {

    public RoomInboxLastMessage {
        requireText(messageId, "messageId");
        if (roomSequence < 1) {
            throw new IllegalArgumentException(
                    "roomSequence must be at least 1");
        }
        if (messageVersion < 1) {
            throw new IllegalArgumentException(
                    "messageVersion must be at least 1");
        }
        Objects.requireNonNull(state, "state");
        Objects.requireNonNull(createdAt, "createdAt");
        if (state == MessageState.ACTIVE) {
            new RoomInboxSummaryPreview(
                    Objects.requireNonNull(preview, "preview"),
                    previewTruncated);
        } else if (preview != null || previewTruncated) {
            throw new IllegalArgumentException(
                    "Deleted summary preview must be null and not truncated");
        }
    }

    public static RoomInboxLastMessage from(ChatMessage message) {
        Objects.requireNonNull(message, "message");
        if (message.state() == MessageState.ACTIVE) {
            RoomInboxSummaryPreview formatted =
                    RoomInboxSummaryPreview.from(message.content());
            return new RoomInboxLastMessage(
                    message.messageId(),
                    message.roomSequence(),
                    message.messageVersion(),
                    message.state(),
                    formatted.value(),
                    formatted.truncated(),
                    message.createdAt());
        }
        return new RoomInboxLastMessage(
                message.messageId(),
                message.roomSequence(),
                message.messageVersion(),
                message.state(),
                null,
                false,
                message.createdAt());
    }

    private static void requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
    }
}
