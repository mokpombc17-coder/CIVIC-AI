package com.hamcheeze.vote.task.application.opinionmap;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record OpinionMapGenerationAttempt(
        UUID attemptId,
        UUID runId,
        int attemptNumber,
        String provider,
        String requestedModel,
        Instant startedAt
) {

    public OpinionMapGenerationAttempt {
        Objects.requireNonNull(attemptId, "attemptId");
        Objects.requireNonNull(runId, "runId");
        if (attemptNumber < 1) {
            throw new IllegalArgumentException(
                    "attemptNumber must be positive");
        }
        provider = requireText(provider, "provider");
        requestedModel = requireText(requestedModel, "requestedModel");
        Objects.requireNonNull(startedAt, "startedAt");
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value.trim();
    }
}
