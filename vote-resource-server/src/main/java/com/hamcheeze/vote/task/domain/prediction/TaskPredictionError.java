package com.hamcheeze.vote.task.domain.prediction;

import com.hamcheeze.vote.task.domain.common.TaskText;

public record TaskPredictionError(String code, String message) {
    public TaskPredictionError {
        code = TaskText.required(
                code, 200, "TASK_PREDICTION_ERROR_CODE", "error.code");
        message = TaskText.optional(
                message, 2_000,
                "TASK_PREDICTION_ERROR_MESSAGE", "error.message");
    }
}
