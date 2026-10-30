package com.hamcheeze.chat.room.inbox.summary.maintenance;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;

import java.util.Objects;

public record RoomInboxSummaryCandidate(
        ChatMessage source,
        RoomInboxSummary expected
) {

    public RoomInboxSummaryCandidate {
        Objects.requireNonNull(source, "source");
        Objects.requireNonNull(expected, "expected");
    }

    public static RoomInboxSummaryCandidate from(ChatMessage message) {
        RoomInboxLastMessage lastMessage =
                RoomInboxLastMessage.from(message);
        return new RoomInboxSummaryCandidate(
                message,
                new RoomInboxSummary(
                        message.roomId(),
                        lastMessage,
                        message.createdAt(),
                        message.updatedAt()));
    }
}
