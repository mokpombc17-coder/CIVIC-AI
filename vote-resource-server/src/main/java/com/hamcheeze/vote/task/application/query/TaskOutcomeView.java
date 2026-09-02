package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;

import java.time.Instant;
import java.util.Objects;

public record TaskOutcomeView(
        TaskSubmissionId outcomeId,
        TaskPersonaId personaId,
        TaskPredictionId predictionRequestId,
        TaskId taskId,
        TaskQuestionId questionId,
        TaskOptionId selectedOptionId,
        TaskReasonSource reasonSource,
        TaskPredictedReasonId acceptedCandidateId,
        String finalReason,
        Instant submittedAt
) {
    public TaskOutcomeView {
        Objects.requireNonNull(outcomeId, "outcomeId");
        Objects.requireNonNull(personaId, "personaId");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(selectedOptionId, "selectedOptionId");
        Objects.requireNonNull(reasonSource, "reasonSource");
        Objects.requireNonNull(finalReason, "finalReason");
        Objects.requireNonNull(submittedAt, "submittedAt");
        if (finalReason.isBlank()) {
            throw new IllegalArgumentException("finalReason must not be blank");
        }
        if (reasonSource == TaskReasonSource.AI_ACCEPTED
                && (predictionRequestId == null
                || acceptedCandidateId == null)) {
            throw new IllegalArgumentException(
                    "AI_ACCEPTED outcome requires prediction and candidate IDs");
        }
        if (reasonSource == TaskReasonSource.USER_WRITTEN
                && acceptedCandidateId != null) {
            throw new IllegalArgumentException(
                    "USER_WRITTEN outcome must not have candidate ID");
        }
    }
}
