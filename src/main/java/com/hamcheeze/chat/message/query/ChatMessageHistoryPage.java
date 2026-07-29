package com.hamcheeze.chat.message.query;

import com.hamcheeze.chat.message.ChatMessage;

import java.util.List;
import java.util.Objects;

public record ChatMessageHistoryPage(
        List<ChatMessage> items,
        Long nextBeforeSequence,
        Long nextAfterSequence,
        boolean hasMore
) {

    public ChatMessageHistoryPage {
        items = List.copyOf(Objects.requireNonNull(items, "items"));
        int cursorCount = (nextBeforeSequence == null ? 0 : 1)
                + (nextAfterSequence == null ? 0 : 1);
        if (hasMore != (cursorCount == 1)) {
            throw new IllegalArgumentException(
                    "exactly one cursor must exist when hasMore");
        }
        if (nextBeforeSequence != null && nextBeforeSequence < 1) {
            throw new IllegalArgumentException(
                    "nextBeforeSequence must be at least 1");
        }
        if (nextAfterSequence != null && nextAfterSequence < 1) {
            throw new IllegalArgumentException(
                    "nextAfterSequence must be at least 1");
        }
    }
}
