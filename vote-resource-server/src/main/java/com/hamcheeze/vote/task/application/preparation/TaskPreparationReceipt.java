package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record TaskPreparationReceipt(
        TaskId taskId,
        UUID requestId,
        String contentFingerprint,
        boolean replayed,
        Instant preparedAt
) {
    public TaskPreparationReceipt {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(requestId, "requestId");
        if (contentFingerprint == null || contentFingerprint.isBlank()) {
            throw new IllegalArgumentException(
                    "contentFingerprint must not be blank");
        }
        Objects.requireNonNull(preparedAt, "preparedAt");
    }
}
