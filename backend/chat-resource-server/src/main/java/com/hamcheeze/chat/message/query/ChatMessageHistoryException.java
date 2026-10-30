package com.hamcheeze.chat.message.query;

import java.util.Objects;

public final class ChatMessageHistoryException
        extends RuntimeException {

    private final ChatMessageHistoryErrorCode code;

    public ChatMessageHistoryException(
            ChatMessageHistoryErrorCode code,
            String message
    ) {
        super(message);
        this.code = Objects.requireNonNull(code, "code");
    }

    public ChatMessageHistoryException(
            ChatMessageHistoryErrorCode code,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "code");
    }

    public ChatMessageHistoryErrorCode code() {
        return code;
    }
}
