package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

public record TaskPredictedReasonId(UUID value) {
    public TaskPredictedReasonId {
        value = TaskIdSupport.require(
                value,
                "TASK_PREDICTED_REASON_ID_REQUIRED",
                "predictedReasonId");
    }
}
