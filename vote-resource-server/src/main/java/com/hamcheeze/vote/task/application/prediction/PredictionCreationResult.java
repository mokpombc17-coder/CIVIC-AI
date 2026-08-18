package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;

import java.util.List;
import java.util.Objects;

public record PredictionCreationResult(
        TaskPredictionId requestId,
        TaskId taskId,
        List<TaskPredictionCandidate> candidates,
        int httpStatus,
        SanitizedTaskPredictionPayload responsePayload
) {
    public PredictionCreationResult {
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(taskId, "taskId");
        candidates = List.copyOf(Objects.requireNonNull(
                candidates, "candidates"));
        if (httpStatus < 100 || httpStatus > 599) {
            throw new IllegalArgumentException(
                    "httpStatus must be between 100 and 599");
        }
        Objects.requireNonNull(responsePayload, "responsePayload");
    }
}
