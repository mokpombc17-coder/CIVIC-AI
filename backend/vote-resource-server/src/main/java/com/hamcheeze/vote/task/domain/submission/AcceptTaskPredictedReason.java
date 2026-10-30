package com.hamcheeze.vote.task.domain.submission;

import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;

import java.util.Objects;

public record AcceptTaskPredictedReason(
        TaskQuestionId questionId,
        TaskOptionId selectedOptionId,
        TaskPredictedReasonId predictedReasonId
) implements TaskSubmissionAnswerCommand {
    public AcceptTaskPredictedReason {
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(selectedOptionId, "selectedOptionId");
        Objects.requireNonNull(predictedReasonId, "predictedReasonId");
    }
}
