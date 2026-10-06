package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.query.TaskSearchCursor;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public interface TaskSearchReader {

    List<TaskSearchRow> findByUser(
            TaskUserId userId,
            String normalizedQuery,
            Optional<TaskSearchCursor> cursor,
            Instant observedAt,
            int limit);

    record TaskSearchRow(
            TaskId taskId,
            String title,
            String description,
            TaskStatus taskStatus,
            Instant openedAt,
            Instant closesAt,
            Instant closedAt,
            TaskClosureType closureType,
            TaskSubmissionId submissionId,
            Instant submittedAt,
            boolean resultAvailable,
            Instant sortAt
    ) {
        public TaskSearchRow {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(taskStatus, "taskStatus");
            Objects.requireNonNull(openedAt, "openedAt");
            Objects.requireNonNull(closesAt, "closesAt");
            Objects.requireNonNull(sortAt, "sortAt");
            if (taskStatus == TaskStatus.OPEN) {
                if (closedAt != null || closureType != null
                        || resultAvailable) {
                    throw new IllegalArgumentException(
                            "open search result has invalid closed fields");
                }
            } else if (taskStatus == TaskStatus.CLOSED) {
                Objects.requireNonNull(closedAt, "closedAt");
                Objects.requireNonNull(closureType, "closureType");
                Objects.requireNonNull(submissionId, "submissionId");
                Objects.requireNonNull(submittedAt, "submittedAt");
                if (!resultAvailable) {
                    throw new IllegalArgumentException(
                            "closed search result must have a result");
                }
            } else {
                throw new IllegalArgumentException(
                        "search result status must be OPEN or CLOSED");
            }
            if ((submissionId == null) != (submittedAt == null)) {
                throw new IllegalArgumentException(
                        "submissionId and submittedAt must have the same nullability");
            }
        }
    }
}
