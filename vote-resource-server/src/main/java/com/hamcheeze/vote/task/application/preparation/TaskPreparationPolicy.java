package com.hamcheeze.vote.task.application.preparation;

import java.time.Duration;
import java.util.Objects;

public record TaskPreparationPolicy(
        Duration retryDelay,
        Duration processingLeaseDuration
) {
    public TaskPreparationPolicy {
        positive(retryDelay, "retryDelay");
        positive(processingLeaseDuration, "processingLeaseDuration");
    }

    private static void positive(Duration value, String field) {
        Objects.requireNonNull(value, field);
        if (value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(field + " must be positive");
        }
    }
}
