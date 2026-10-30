package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;

import java.util.Objects;

public record TaskPredictionDispatchClaim(
        TaskPredictionId predictionId,
        TaskPredictionAttemptId attemptId,
        int attemptNumber,
        PredictionCreationCommand command,
        SanitizedTaskPredictionPayload requestPayload
) {
    public TaskPredictionDispatchClaim {
        Objects.requireNonNull(predictionId, "predictionId");
        Objects.requireNonNull(attemptId, "attemptId");
        if (attemptNumber < 1) {
            throw new IllegalArgumentException(
                    "attemptNumber must be positive");
        }
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(requestPayload, "requestPayload");
        if (!predictionId.equals(command.requestId())) {
            throw new IllegalArgumentException(
                    "predictionId and requestId must match");
        }
    }
}
