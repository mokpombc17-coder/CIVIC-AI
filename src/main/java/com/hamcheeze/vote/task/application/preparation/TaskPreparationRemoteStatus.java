package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record TaskPreparationRemoteStatus(
        int schemaVersion,
        UUID requestId,
        TaskId taskId,
        String contentFingerprint,
        TaskPreparationStatus status,
        Instant acceptedAt,
        Instant preparedAt,
        TaskPreparationResult.Error error,
        Instant updatedAt
) {

    public TaskPreparationRemoteStatus {
        if (schemaVersion != 1) {
            throw new IllegalArgumentException(
                    "schemaVersion must be 1");
        }
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(taskId, "taskId");
        if (contentFingerprint == null || contentFingerprint.isBlank()) {
            throw new IllegalArgumentException(
                    "contentFingerprint must not be blank");
        }
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(acceptedAt, "acceptedAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
        validateState(status, preparedAt, error);
    }

    public boolean ready() {
        return status == TaskPreparationStatus.READY;
    }

    TaskPreparationResult terminalResult() {
        if (status == TaskPreparationStatus.PROCESSING) {
            throw new IllegalStateException(
                    "PROCESSING is not a terminal result");
        }
        return new TaskPreparationResult(
                schemaVersion,
                requestId,
                taskId,
                contentFingerprint,
                status,
                preparedAt,
                error);
    }

    private static void validateState(
            TaskPreparationStatus status,
            Instant preparedAt,
            TaskPreparationResult.Error error
    ) {
        if (status == TaskPreparationStatus.PROCESSING) {
            if (preparedAt != null || error != null) {
                throw new IllegalArgumentException(
                        "PROCESSING cannot contain a result");
            }
            return;
        }
        if (status == TaskPreparationStatus.READY) {
            if (preparedAt == null || error != null) {
                throw new IllegalArgumentException(
                        "READY requires preparedAt and no error");
            }
            return;
        }
        if (preparedAt != null || error == null) {
            throw new IllegalArgumentException(
                    "FAILED or REJECTED requires an error only");
        }
        boolean expectedRetryable =
                status == TaskPreparationStatus.FAILED;
        if (error.retryable() != expectedRetryable) {
            throw new IllegalArgumentException(
                    "error.retryable does not match status");
        }
    }
}
