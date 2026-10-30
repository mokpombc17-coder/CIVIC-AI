package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/** Anonymous reader for an open Task's submitted responses. */
public interface TaskProgressResponseReader {

    List<SubmissionRow> findByTask(
            TaskId taskId,
            Optional<SubmissionCursor> cursor,
            int limit);

    record SubmissionCursor(
            TaskId taskId,
            Instant submittedAt,
            TaskSubmissionId submissionId
    ) {
        public SubmissionCursor {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(submittedAt, "submittedAt");
            Objects.requireNonNull(submissionId, "submissionId");
        }
    }

    record SubmissionRow(
            TaskSubmissionId submissionId,
            TaskOptionId selectedOptionId,
            TaskReasonSource reasonSource,
            String finalReason,
            Instant submittedAt
    ) {
        public SubmissionRow {
            Objects.requireNonNull(submissionId, "submissionId");
            Objects.requireNonNull(selectedOptionId, "selectedOptionId");
            Objects.requireNonNull(reasonSource, "reasonSource");
            Objects.requireNonNull(finalReason, "finalReason");
            Objects.requireNonNull(submittedAt, "submittedAt");
        }
    }
}
