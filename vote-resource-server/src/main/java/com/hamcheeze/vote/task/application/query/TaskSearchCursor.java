package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.TaskStatus;

import java.time.Instant;
import java.util.Objects;

public record TaskSearchCursor(
        String queryFingerprint,
        String userFingerprint,
        TaskStatus taskStatus,
        Instant sortAt,
        TaskId taskId
) {

    public TaskSearchCursor {
        requireFingerprint(queryFingerprint, "queryFingerprint");
        requireFingerprint(userFingerprint, "userFingerprint");
        Objects.requireNonNull(taskStatus, "taskStatus");
        Objects.requireNonNull(sortAt, "sortAt");
        Objects.requireNonNull(taskId, "taskId");
        if (taskStatus != TaskStatus.OPEN
                && taskStatus != TaskStatus.CLOSED) {
            throw new IllegalArgumentException(
                    "taskStatus must be OPEN or CLOSED");
        }
    }

    private static void requireFingerprint(String value, String field) {
        Objects.requireNonNull(value, field);
        if (!value.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException(
                    field + " must be a SHA-256 hex string");
        }
    }
}
