package com.hamcheeze.vote.task.application.idempotency;

import java.util.Objects;

public record TaskIdempotencyExecution<T>(T result, boolean replayed) {
    public TaskIdempotencyExecution {
        Objects.requireNonNull(result, "result");
    }
}
