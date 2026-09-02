package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;

import java.time.Instant;
import java.util.Objects;

public record TaskOutcomeCursor(
        TaskId taskId,
        Instant submittedAt,
        TaskSubmissionId outcomeId
) {
    public TaskOutcomeCursor {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(submittedAt, "submittedAt");
        Objects.requireNonNull(outcomeId, "outcomeId");
    }
}
