package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record TaskPreparationProviderResult(
        int schemaVersion,
        UUID requestId,
        TaskId taskId,
        String contentFingerprint,
        TaskPreparationStatus status,
        boolean replayed,
        Instant preparedAt
) {
    public TaskPreparationProviderResult {
        if (schemaVersion < 1) {
            throw new IllegalArgumentException(
                    "schemaVersion must be positive");
        }
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(taskId, "taskId");
        if (contentFingerprint == null || contentFingerprint.isBlank()) {
            throw new IllegalArgumentException(
                    "contentFingerprint must not be blank");
        }
        Objects.requireNonNull(status, "status");
        if (status != TaskPreparationStatus.PROCESSING
                && status != TaskPreparationStatus.READY) {
            throw new IllegalArgumentException(
                    "provider status must be PROCESSING or READY");
        }
        if ((status == TaskPreparationStatus.READY) != (preparedAt != null)) {
            throw new IllegalArgumentException(
                    "preparedAt is required only for READY");
        }
    }
}
