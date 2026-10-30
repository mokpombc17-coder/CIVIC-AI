package com.hamcheeze.vote.task.application.opinionmap;

import java.time.Duration;

public record OpinionMapGenerationPolicy(
        boolean enabled,
        String promptVersion,
        Duration requestTimeout,
        int maximumAttempts,
        Duration retryDelay,
        Duration processingLeaseDuration,
        int batchSize
) {

    public OpinionMapGenerationPolicy {
        if (promptVersion == null || promptVersion.isBlank()) {
            throw new IllegalArgumentException(
                    "promptVersion must not be blank");
        }
        promptVersion = promptVersion.trim();
        requirePositive(requestTimeout, "requestTimeout");
        requirePositive(retryDelay, "retryDelay");
        requirePositive(processingLeaseDuration, "processingLeaseDuration");
        if (processingLeaseDuration.compareTo(requestTimeout) <= 0) {
            throw new IllegalArgumentException(
                    "processingLeaseDuration must exceed requestTimeout");
        }
        if (maximumAttempts < 1) {
            throw new IllegalArgumentException(
                    "maximumAttempts must be positive");
        }
        if (batchSize < 1) {
            throw new IllegalArgumentException("batchSize must be positive");
        }
    }

    private static void requirePositive(Duration value, String name) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(name + " must be positive");
        }
    }
}
