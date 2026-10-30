package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.util.Objects;
import java.util.UUID;

public record TaskPreparationCommand(
        int schemaVersion,
        UUID requestId,
        TaskId taskId,
        String contentFingerprint,
        String requestPayload
) {
    public TaskPreparationCommand {
        if (schemaVersion < 1) {
            throw new IllegalArgumentException(
                    "schemaVersion must be positive");
        }
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(taskId, "taskId");
        requireText(contentFingerprint, "contentFingerprint");
        requireText(requestPayload, "requestPayload");
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
    }
}
