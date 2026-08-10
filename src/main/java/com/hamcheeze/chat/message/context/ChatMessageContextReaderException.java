package com.hamcheeze.chat.message.context;

import java.util.Objects;

public final class ChatMessageContextReaderException
        extends RuntimeException {

    private final FailureKind kind;

    public ChatMessageContextReaderException(
            FailureKind kind,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.kind = Objects.requireNonNull(kind, "kind");
    }

    public FailureKind kind() {
        return kind;
    }

    public enum FailureKind {
        STORAGE_UNAVAILABLE,
        DATA_INCONSISTENT
    }
}
