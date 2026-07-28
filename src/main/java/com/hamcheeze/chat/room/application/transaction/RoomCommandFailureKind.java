package com.hamcheeze.chat.room.application.transaction;

public enum RoomCommandFailureKind {
    TRANSIENT,
    CONCURRENCY_RETRY_EXHAUSTED,
    OUTCOME_UNKNOWN,
    DATA_INTEGRITY,
    PERMANENT
}
