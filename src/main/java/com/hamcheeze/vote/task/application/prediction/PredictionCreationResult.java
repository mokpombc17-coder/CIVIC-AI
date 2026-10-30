package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;

import java.util.List;
import java.util.Objects;

public record PredictionCreationResult(
        TaskPredictionId requestId,
        TaskId taskId,
        List<TaskPredictedReason> predictedReasons,
        int httpStatus,
        SanitizedTaskPredictionPayload responsePayload
) {
    public PredictionCreationResult {
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(taskId, "taskId");
        predictedReasons = List.copyOf(Objects.requireNonNull(
                predictedReasons, "predictedReasons"));
        if (httpStatus < 100 || httpStatus > 599) {
            throw new IllegalArgumentException(
                    "httpStatus must be between 100 and 599");
        }
        Objects.requireNonNull(responsePayload, "responsePayload");
    }
}
