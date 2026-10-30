package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

public record TaskPredictionId(UUID value) {
    public TaskPredictionId {
        value = TaskIdSupport.require(
                value, "TASK_PREDICTION_ID_REQUIRED", "predictionId");
    }
}
