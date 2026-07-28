package com.hamcheeze.chat.room.application.transaction;

public enum RoomCommandFailureKind {
    TRANSIENT,
    CONCURRENCY_RETRY_EXHAUSTED,
    OUTCOME_UNKNOWN,
    ACCESS_REVOCATION_FAILED,
    DATA_INTEGRITY,
    PERMANENT
}
