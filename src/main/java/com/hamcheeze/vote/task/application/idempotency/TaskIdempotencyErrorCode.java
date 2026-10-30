package com.hamcheeze.vote.task.application.idempotency;

public enum TaskIdempotencyErrorCode {
    INVALID_IDEMPOTENCY_KEY,
    IDEMPOTENCY_CONFLICT
}
