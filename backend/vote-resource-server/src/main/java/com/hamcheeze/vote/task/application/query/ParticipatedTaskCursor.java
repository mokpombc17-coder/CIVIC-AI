package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.time.Instant;
import java.util.Objects;

public record ParticipatedTaskCursor(
        String queryFingerprint,
        Instant submittedAt,
        TaskId taskId
) {

    public ParticipatedTaskCursor {
        Objects.requireNonNull(queryFingerprint, "queryFingerprint");
        Objects.requireNonNull(submittedAt, "submittedAt");
        Objects.requireNonNull(taskId, "taskId");
        if (!queryFingerprint.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException(
                    "queryFingerprint must be a SHA-256 hex string");
        }
    }
}
