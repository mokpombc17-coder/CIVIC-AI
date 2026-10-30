package com.hamcheeze.chat.message.search;

public record ChatMessageSearchRateLimitDecision(
        boolean allowed,
        long retryAfterMs
) {

    public ChatMessageSearchRateLimitDecision {
        if (allowed && retryAfterMs != 0) {
            throw new IllegalArgumentException(
                    "allowed decision must not have retryAfterMs");
        }
        if (!allowed && retryAfterMs < 1) {
            throw new IllegalArgumentException(
                    "rejected decision requires retryAfterMs");
        }
    }

    public static ChatMessageSearchRateLimitDecision allow() {
        return new ChatMessageSearchRateLimitDecision(true, 0);
    }

    public static ChatMessageSearchRateLimitDecision reject(
            long retryAfterMs
    ) {
        return new ChatMessageSearchRateLimitDecision(
                false,
                retryAfterMs);
    }
}
