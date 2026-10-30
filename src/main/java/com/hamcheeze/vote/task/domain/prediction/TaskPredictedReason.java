package com.hamcheeze.vote.task.domain.prediction;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskText;

import java.util.Objects;

public record TaskPredictedReason(
        TaskPredictedReasonId id,
        TaskPredictionId predictionId,
        TaskOptionId optionId,
        int reasonOrder,
        String reason
) {
    public TaskPredictedReason {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(predictionId, "predictionId");
        Objects.requireNonNull(optionId, "optionId");
        if (reasonOrder < 1
                || reasonOrder
                > TaskLimits.MAX_PREDICTED_REASONS_PER_OPTION) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTED_REASON_ORDER_INVALID",
                    "reasonOrder",
                    "reasonOrder must be between 1 and "
                            + TaskLimits.MAX_PREDICTED_REASONS_PER_OPTION);
        }
        reason = TaskText.required(
                reason,
                TaskLimits.MAX_REASON_LENGTH,
                "TASK_PREDICTED_REASON_REQUIRED",
                "reason");
    }
}
