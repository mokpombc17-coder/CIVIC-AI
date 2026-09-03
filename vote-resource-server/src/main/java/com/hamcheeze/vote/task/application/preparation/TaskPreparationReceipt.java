package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record TaskPreparationReceipt(
        TaskId taskId,
        UUID requestId,
        String contentFingerprint,
        TaskPreparationStatus status,
        int attemptCount,
        boolean replayed,
        Instant processingStartedAt,
        Instant preparedAt,
        String lastErrorCode,
        String lastErrorDetail,
        Instant updatedAt
) {
    public TaskPreparationReceipt {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(requestId, "requestId");
        if (contentFingerprint == null || contentFingerprint.isBlank()) {
            throw new IllegalArgumentException(
                    "contentFingerprint must not be blank");
        }
        Objects.requireNonNull(status, "status");
        if (attemptCount < 1) {
            throw new IllegalArgumentException(
                    "attemptCount must be positive");
        }
        Objects.requireNonNull(updatedAt, "updatedAt");
    }

    static TaskPreparationReceipt from(
            TaskPreparationRecord preparation,
            boolean replayed
    ) {
        Objects.requireNonNull(preparation, "preparation");
        return new TaskPreparationReceipt(
                preparation.taskId(),
                preparation.requestId(),
                preparation.contentFingerprint(),
                preparation.status(),
                preparation.attemptCount(),
                replayed,
                preparation.processingStartedAt(),
                preparation.preparedAt(),
                preparation.lastErrorCode(),
                preparation.lastErrorDetail(),
                preparation.updatedAt());
    }
}
