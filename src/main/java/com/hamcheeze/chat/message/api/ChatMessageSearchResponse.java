package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.search.ChatMessageSearchPage;

import java.util.List;
import java.util.Objects;

public record ChatMessageSearchResponse(
        List<ChatMessagePayload> items,
        String nextCursor,
        boolean searchComplete
) {

    public ChatMessageSearchResponse {
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

    public static ChatMessageSearchResponse from(
            ChatMessageSearchPage page
    ) {
        Objects.requireNonNull(page, "page");
        return new ChatMessageSearchResponse(
                page.items().stream()
                        .map(ChatMessagePayload::from)
                        .toList(),
                page.nextCursor(),
                page.searchComplete());
    }
}
