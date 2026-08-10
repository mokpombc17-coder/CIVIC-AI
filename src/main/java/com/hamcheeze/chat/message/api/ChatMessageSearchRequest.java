package com.hamcheeze.chat.message.api;

public record ChatMessageSearchRequest(
        String query,
        String cursor,
        Integer limit
) {
}
