package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.query.CompletedTaskCursor;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public interface CompletedTaskReader {

    List<CompletedTaskRow> findByUser(
            TaskUserId userId,
            Optional<CompletedTaskCursor> cursor,
            int limit);

    record CompletedTaskRow(
            TaskId taskId,
            String title,
            String description,
            Instant openedAt,
            Instant closedAt,
            TaskClosureType closureType,
            TaskSubmissionId submissionId,
            Instant submittedAt
    ) {
        public CompletedTaskRow {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(openedAt, "openedAt");
            Objects.requireNonNull(closedAt, "closedAt");
            Objects.requireNonNull(closureType, "closureType");
            Objects.requireNonNull(submissionId, "submissionId");
            Objects.requireNonNull(submittedAt, "submittedAt");
        }
    }
}
