package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.query.ChatMessageHistoryPage;

import java.util.List;

public record ChatMessageHistoryResponse(
        List<ChatMessagePayload> items,
        Long nextBeforeSequence,
        Long nextAfterSequence,
        boolean hasMore
) {

    public static ChatMessageHistoryResponse from(
            ChatMessageHistoryPage page
    ) {
        return new ChatMessageHistoryResponse(
                page.items().stream()
                        .map(ChatMessagePayload::from)
                        .toList(),
                page.nextBeforeSequence(),
                page.nextAfterSequence(),
                page.hasMore());
    }
}
