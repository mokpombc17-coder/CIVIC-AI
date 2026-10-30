package com.hamcheeze.chat.message.search;

import com.hamcheeze.chat.message.ChatMessage;

import java.util.List;
import java.util.Objects;

public record ChatMessageSearchPage(
        List<ChatMessage> items,
        String nextCursor,
        boolean searchComplete
) {

    public ChatMessageSearchPage {
        items = List.copyOf(Objects.requireNonNull(items, "items"));
        if (searchComplete && nextCursor != null) {
            throw new IllegalArgumentException(
                    "completed search must not have a next cursor");
        }
        if (!searchComplete
                && (nextCursor == null || nextCursor.isBlank())) {
            throw new IllegalArgumentException(
                    "incomplete search must have a next cursor");
        }
    }
}
