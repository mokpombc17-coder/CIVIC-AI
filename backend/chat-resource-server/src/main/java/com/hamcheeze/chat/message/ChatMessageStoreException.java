package com.hamcheeze.chat.message;

import java.util.Objects;

public final class ChatMessageStoreException extends RuntimeException {

    private final ChatMessageStoreFailureKind kind;

    public ChatMessageStoreException(String message) {
        this(ChatMessageStoreFailureKind.PERMANENT, message, null);
    }

    public ChatMessageStoreException(
            String message,
            Throwable cause
    ) {
        this(ChatMessageStoreFailureKind.PERMANENT, message, cause);
    }

    public ChatMessageStoreException(
            ChatMessageStoreFailureKind kind,
            String message
    ) {
        this(kind, message, null);
    }

    public ChatMessageStoreException(
            ChatMessageStoreFailureKind kind,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.kind = Objects.requireNonNull(kind, "kind");
    }

    public ChatMessageStoreFailureKind kind() {
        return kind;
    }

    public boolean retryable() {
        return kind == ChatMessageStoreFailureKind.TRANSIENT
                || kind == ChatMessageStoreFailureKind.OUTCOME_UNKNOWN;
    }
}
