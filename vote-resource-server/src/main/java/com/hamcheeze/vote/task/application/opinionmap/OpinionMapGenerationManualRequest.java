package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record OpinionMapGenerationManualRequest(
        UUID requestId,
        OpinionMapGenerationId generationId,
        Action action,
        int previousAttemptCount,
        String previousErrorCode,
        String requestedBy,
        Instant requestedAt
) {

    public OpinionMapGenerationManualRequest {
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(generationId, "generationId");
        Objects.requireNonNull(action, "action");
        if (previousAttemptCount < 0) {
            throw new IllegalArgumentException(
                    "previousAttemptCount must not be negative");
        }
        previousErrorCode = normalizeOptional(previousErrorCode);
        requestedBy = requireText(requestedBy, "requestedBy");
        Objects.requireNonNull(requestedAt, "requestedAt");
        if (action == Action.RETRIED
                && (previousAttemptCount < 1 || previousErrorCode == null)) {
            throw new IllegalArgumentException(
                    "a retry must preserve the previous failure");
        }
        if (action == Action.CREATED
                && (previousAttemptCount != 0 || previousErrorCode != null)) {
            throw new IllegalArgumentException(
                    "creation must not have a previous failure");
        }
    }

    private static String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        String normalized = value.trim();
        if (normalized.length() > 255) {
            throw new IllegalArgumentException(field + " is too long");
        }
        return normalized;
    }

    public enum Action {
        CREATED,
        RETRIED
    }
}
