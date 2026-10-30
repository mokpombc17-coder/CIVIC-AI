package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record PersonaGenerationRetryRequest(
        UUID retryRequestId,
        PersonaGenerationId generationId,
        String idempotencyKey,
        int failedAttemptCount,
        String requestedBy,
        Instant requestedAt,
        String reason,
        String requestFingerprint
) {

    public static final int MAX_IDEMPOTENCY_KEY_LENGTH = 200;
    public static final int MAX_REASON_LENGTH = 1000;

    public PersonaGenerationRetryRequest {
        Objects.requireNonNull(retryRequestId, "retryRequestId");
        Objects.requireNonNull(generationId, "generationId");
        idempotencyKey = requireText(
                idempotencyKey,
                MAX_IDEMPOTENCY_KEY_LENGTH,
                "idempotencyKey");
        if (failedAttemptCount < 1) {
            throw new IllegalArgumentException(
                    "failedAttemptCount must be at least 1");
        }
        requestedBy = requireText(requestedBy, 255, "requestedBy");
        Objects.requireNonNull(requestedAt, "requestedAt");
        reason = requireText(reason, MAX_REASON_LENGTH, "reason");
        if (requestFingerprint == null
                || !requestFingerprint.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException(
                    "requestFingerprint must be a lowercase SHA-256 hash");
        }
    }

    private static String requireText(
            String value,
            int maximumLength,
            String field
    ) {
        if (value == null) {
            throw new IllegalArgumentException(field + " must not be null");
        }
        String normalized = value.trim();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        if (normalized.length() > maximumLength) {
            throw new IllegalArgumentException(
                    field + " must not exceed " + maximumLength
                            + " characters");
        }
        return normalized;
    }
}
