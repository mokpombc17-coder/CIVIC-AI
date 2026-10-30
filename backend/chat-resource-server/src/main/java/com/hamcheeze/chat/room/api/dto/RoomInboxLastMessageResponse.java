package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;

import java.time.Instant;

public record RoomInboxLastMessageResponse(
        String messageId,
        long roomSequence,
        long messageVersion,
        MessageState state,
        String preview,
        boolean previewTruncated,
        Instant createdAt
) {

    public static RoomInboxLastMessageResponse from(
            RoomInboxLastMessage message
    ) {
        if (message == null) {
            return null;
        }
        return new RoomInboxLastMessageResponse(
                message.messageId(),
                message.roomSequence(),
                message.messageVersion(),
                message.state(),
                message.preview(),
                message.previewTruncated(),
                message.createdAt());
    }
}
