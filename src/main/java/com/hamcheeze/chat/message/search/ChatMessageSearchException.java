package com.hamcheeze.chat.message.search;

import java.util.Objects;

public final class ChatMessageSearchException
        extends RuntimeException {

    private final ChatMessageSearchErrorCode code;

    public ChatMessageSearchException(
            ChatMessageSearchErrorCode code,
            String message
    ) {
        super(message);
        this.code = Objects.requireNonNull(code, "code");
    }

    public ChatMessageSearchException(
            ChatMessageSearchErrorCode code,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "code");
    }

    public ChatMessageSearchErrorCode code() {
        return code;
    }
}
