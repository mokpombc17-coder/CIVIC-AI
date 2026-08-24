package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;

import java.time.Instant;
import java.util.Objects;

/** Minimal internal row needed to assemble a task result read model. */
public record TaskResultResponse(
        TaskSubmissionId submissionId,
        TaskId taskId,
        TaskQuestionId questionId,
        TaskOptionId selectedOptionId,
        String finalReason,
        TaskReasonSource reasonSource,
        Instant submittedAt
) {

    public TaskResultResponse {
        Objects.requireNonNull(submissionId, "submissionId");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(selectedOptionId, "selectedOptionId");
        Objects.requireNonNull(finalReason, "finalReason");
        Objects.requireNonNull(reasonSource, "reasonSource");
        Objects.requireNonNull(submittedAt, "submittedAt");
    }
}
