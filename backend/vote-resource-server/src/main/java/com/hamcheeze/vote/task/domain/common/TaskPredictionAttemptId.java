package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

public record TaskPredictionAttemptId(UUID value) {
    public TaskPredictionAttemptId {
        value = TaskIdSupport.require(
                value,
                "TASK_PREDICTION_ATTEMPT_ID_REQUIRED",
                "attemptId");
    }
}
