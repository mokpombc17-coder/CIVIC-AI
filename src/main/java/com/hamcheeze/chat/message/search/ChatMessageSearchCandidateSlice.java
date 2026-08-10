package com.hamcheeze.chat.message.search;

import com.hamcheeze.chat.message.ChatMessage;

import java.util.List;
import java.util.Objects;

public record ChatMessageSearchCandidateSlice(
        List<ChatMessage> items,
        boolean hasOlderCandidates
) {

    public ChatMessageSearchCandidateSlice {
        items = List.copyOf(Objects.requireNonNull(items, "items"));
        if (items.isEmpty() && hasOlderCandidates) {
            throw new IllegalArgumentException(
                    "empty candidate slice cannot have older candidates");
        }
    }
}
