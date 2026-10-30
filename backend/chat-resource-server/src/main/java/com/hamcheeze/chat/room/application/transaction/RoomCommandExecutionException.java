package com.hamcheeze.chat.room.application.transaction;

import java.util.Objects;

public final class RoomCommandExecutionException
        extends RuntimeException {

    private final RoomCommandFailureKind kind;

    public RoomCommandExecutionException(
            RoomCommandFailureKind kind,
            String message
    ) {
        this(kind, message, null);
    }

    public RoomCommandExecutionException(
            RoomCommandFailureKind kind,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.kind = Objects.requireNonNull(kind, "kind");
    }

    public RoomCommandFailureKind kind() {
        return kind;
    }

    public boolean retryable() {
        return kind == RoomCommandFailureKind.TRANSIENT
                || kind == RoomCommandFailureKind
                .CONCURRENCY_RETRY_EXHAUSTED
                || kind == RoomCommandFailureKind.OUTCOME_UNKNOWN
                || kind == RoomCommandFailureKind
                .ACCESS_REVOCATION_FAILED;
    }
}
