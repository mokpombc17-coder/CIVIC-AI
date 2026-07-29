package com.hamcheeze.chat.message.query;

import com.hamcheeze.chat.message.ChatMessage;

import java.util.List;
import java.util.Objects;

public record ChatMessageHistoryPage(
        List<ChatMessage> items,
        Long nextAfterSequence,
        boolean hasNext
) {

    public ChatMessageHistoryPage {
        items = List.copyOf(Objects.requireNonNull(items, "items"));
        if (hasNext != (nextAfterSequence != null)) {
            throw new IllegalArgumentException(
                    "nextAfterSequence must exist exactly when hasNext");
        }
        if (nextAfterSequence != null && nextAfterSequence < 1) {
            throw new IllegalArgumentException(
                    "nextAfterSequence must be at least 1");
        }
    }
}
