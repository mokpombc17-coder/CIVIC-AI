package com.hamcheeze.chat.message.search;

public interface ChatMessageSearchRateLimiter {

    ChatMessageSearchRateLimitDecision tryAcquire(String userId);

    static ChatMessageSearchRateLimiter permitAll() {
        return ignored -> ChatMessageSearchRateLimitDecision.allow();
    }
}
