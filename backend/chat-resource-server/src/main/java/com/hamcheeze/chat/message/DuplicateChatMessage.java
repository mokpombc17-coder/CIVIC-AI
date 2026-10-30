package com.hamcheeze.chat.message;

import java.util.Objects;

public record DuplicateChatMessage(
        ChatMessage message
) implements StoreChatMessageResult {

    public DuplicateChatMessage {
        Objects.requireNonNull(message, "message");
    }
}
