package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record TaskPreparationRecord(
        TaskId taskId,
        UUID requestId,
        String contentFingerprint,
        String requestPayload,
        TaskPreparationStatus status,
        int attemptCount,
        Instant processingStartedAt,
        Instant nextRetryAt,
        Instant publicationVerificationNextRetryAt,
        Instant preparedAt,
        String lastErrorCode,
        String lastErrorDetail,
        Instant createdAt,
        Instant updatedAt
) {
    public TaskPreparationRecord {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(requestId, "requestId");
        requireText(contentFingerprint, "contentFingerprint");
        requireText(requestPayload, "requestPayload");
        Objects.requireNonNull(status, "status");
        if (attemptCount < 1) {
            throw new IllegalArgumentException(
                    "attemptCount must be positive");
        }
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }

    public boolean readyFor(String fingerprint) {
        return status == TaskPreparationStatus.READY
                && contentFingerprint.equals(fingerprint);
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
    }
}
