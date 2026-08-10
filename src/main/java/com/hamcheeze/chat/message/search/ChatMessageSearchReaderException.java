package com.hamcheeze.chat.message.search;

import java.util.Objects;

public final class ChatMessageSearchReaderException
        extends RuntimeException {

    private final FailureKind kind;

    public ChatMessageSearchReaderException(
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
