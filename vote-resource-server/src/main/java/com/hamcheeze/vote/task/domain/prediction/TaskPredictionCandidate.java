package com.hamcheeze.vote.task.domain.prediction;

import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskText;

import java.util.Objects;

public record TaskPredictionCandidate(
        TaskPredictionCandidateId id,
        TaskPredictionId predictionId,
        TaskQuestionId questionId,
        int candidateOrder,
        TaskAnswerValue answerValue,
        String rationale
) {
    public TaskPredictionCandidate {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(predictionId, "predictionId");
        Objects.requireNonNull(questionId, "questionId");
        if (candidateOrder < 1) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_CANDIDATE_ORDER_INVALID",
                    "candidateOrder",
                    "candidateOrder must be positive");
        }
        Objects.requireNonNull(answerValue, "answerValue");
        rationale = TaskText.required(
                rationale,
                TaskLimits.MAX_RATIONALE_LENGTH,
                "TASK_PREDICTION_RATIONALE",
                "rationale");
    }

    public TaskPredictionCandidate normalized(TaskAnswerValue normalizedAnswer) {
        return new TaskPredictionCandidate(
                id, predictionId, questionId, candidateOrder,
                normalizedAnswer, rationale);
    }
}
