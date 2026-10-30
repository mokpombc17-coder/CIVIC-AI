package com.hamcheeze.chat.room.inbox.notification;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;

import java.util.Objects;

public record RoomInboxCurrentLastMessage(
        String messageId,
        long roomSequence,
        long messageVersion,
        MessageState state
) {

    public RoomInboxCurrentLastMessage {
        if (messageId == null || messageId.isBlank()) {
            throw new IllegalArgumentException(
                    "messageId must not be blank");
        }
        if (roomSequence < 1 || messageVersion < 1) {
            throw new IllegalArgumentException(
                    "sequence and version must be positive");
        }
        Objects.requireNonNull(state, "state");
    }

    public static RoomInboxCurrentLastMessage from(
            RoomInboxLastMessage message
    ) {
        Objects.requireNonNull(message, "message");
        return new RoomInboxCurrentLastMessage(
                message.messageId(),
                message.roomSequence(),
                message.messageVersion(),
                message.state());
    }
}
