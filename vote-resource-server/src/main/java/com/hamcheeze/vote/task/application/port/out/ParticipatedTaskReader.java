package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.query.ParticipatedTaskCursor;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public interface ParticipatedTaskReader {

    List<ParticipatedTaskRow> findByUser(
            TaskUserId userId,
            String normalizedQuery,
            Optional<ParticipatedTaskCursor> cursor,
            int limit);

    record ParticipatedTaskRow(
            TaskId taskId,
            String title,
            String description,
            Instant openedAt,
            Instant closesAt,
            TaskStatus taskStatus,
            Instant closedAt,
            TaskClosureType closureType,
            TaskSubmissionId submissionId,
            Instant submittedAt,
            Integer resultVersion,
            Instant finalizedAt
    ) {
        public ParticipatedTaskRow {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(closesAt, "closesAt");
            Objects.requireNonNull(taskStatus, "taskStatus");
            Objects.requireNonNull(submissionId, "submissionId");
            Objects.requireNonNull(submittedAt, "submittedAt");
            if ((resultVersion == null) != (finalizedAt == null)) {
                throw new IllegalArgumentException(
                        "result metadata must be present together");
            }
        }
    }
}
