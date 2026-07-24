package com.hamcheeze.chat.message;

import java.util.Objects;

public record StoredChatMessage(
        ChatMessage message
) implements StoreChatMessageResult {

    public StoredChatMessage {
        Objects.requireNonNull(message, "message");
    }
}
