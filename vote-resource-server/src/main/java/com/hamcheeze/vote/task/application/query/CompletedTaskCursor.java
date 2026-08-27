package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.time.Instant;
import java.util.Objects;

public record CompletedTaskCursor(
        Instant closedAt,
        TaskId taskId
) {

    public CompletedTaskCursor {
        Objects.requireNonNull(closedAt, "closedAt");
        Objects.requireNonNull(taskId, "taskId");
    }
}
