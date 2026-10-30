package com.hamcheeze.chat.message.search;

import java.util.Objects;

public final class ChatMessageSearchException
        extends RuntimeException {

    private final ChatMessageSearchErrorCode code;
    private final Long retryAfterMs;

    public ChatMessageSearchException(
            ChatMessageSearchErrorCode code,
            String message
    ) {
        this(code, message, null, null);
    }

    public ChatMessageSearchException(
            ChatMessageSearchErrorCode code,
            String message,
            Throwable cause
    ) {
        this(code, message, cause, null);
    }

    public ChatMessageSearchException(
            ChatMessageSearchErrorCode code,
            String message,
            Long retryAfterMs
    ) {
        this(code, message, null, retryAfterMs);
    }

    private ChatMessageSearchException(
            ChatMessageSearchErrorCode code,
            String message,
            Throwable cause,
            Long retryAfterMs
    ) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "code");
        if (retryAfterMs != null && retryAfterMs < 1) {
            throw new IllegalArgumentException(
                    "retryAfterMs must be positive");
        }
        this.retryAfterMs = retryAfterMs;
    }

    public ChatMessageSearchErrorCode code() {
        return code;
    }

    public Long retryAfterMs() {
        return retryAfterMs;
    }
}
