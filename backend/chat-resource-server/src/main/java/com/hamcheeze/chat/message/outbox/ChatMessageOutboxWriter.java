package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.message.ChatMessage;

public interface ChatMessageOutboxWriter {

    void appendMessageCreated(ChatMessage message);

    default void appendMessageUpdated(ChatMessage message) {
        throw new UnsupportedOperationException(
                "UPDATE outbox writer is not configured");
    }

    default void appendMessageDeleted(ChatMessage message) {
        throw new UnsupportedOperationException(
                "DELETE outbox writer is not configured");
    }
}
