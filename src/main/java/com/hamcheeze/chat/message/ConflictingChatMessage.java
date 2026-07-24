package com.hamcheeze.chat.message;

import java.util.Objects;

public record ConflictingChatMessage(
        ChatMessage existingMessage
) implements StoreChatMessageResult {

    public ConflictingChatMessage {
        Objects.requireNonNull(existingMessage, "existingMessage");
    }
}
