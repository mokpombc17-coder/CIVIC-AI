package com.hamcheeze.vote.task.domain.submission;

import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;

import java.util.Objects;

public record AcceptTaskPredictionCandidate(
        TaskQuestionId questionId,
        TaskPredictedReasonId candidateId
) implements TaskSubmissionAnswerCommand {
    public AcceptTaskPredictionCandidate {
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(candidateId, "candidateId");
    }
}
