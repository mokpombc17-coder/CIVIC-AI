package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.util.Objects;
import java.util.UUID;

public record TaskPreparationVerification(
        int schemaVersion,
        UUID requestId,
        TaskId taskId,
        String contentFingerprint
) {

    public TaskPreparationVerification {
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
    }
}
