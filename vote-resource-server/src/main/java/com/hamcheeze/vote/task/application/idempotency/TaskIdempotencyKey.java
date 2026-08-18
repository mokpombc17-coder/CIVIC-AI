package com.hamcheeze.vote.task.application.idempotency;

import java.util.Objects;
import java.util.UUID;

public record TaskIdempotencyKey(UUID value) {

    public TaskIdempotencyKey {
        Objects.requireNonNull(value, "value");
    }
}
