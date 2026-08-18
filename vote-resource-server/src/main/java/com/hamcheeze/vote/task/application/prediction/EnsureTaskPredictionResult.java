package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;

import java.util.Objects;

public record EnsureTaskPredictionResult(
        TaskPrediction prediction,
        boolean created,
        boolean predictedAnswerAllowed,
        boolean directAnswerAllowed
) {
    public EnsureTaskPredictionResult {
        Objects.requireNonNull(prediction, "prediction");
        if (predictedAnswerAllowed
                != (prediction.status() == TaskPredictionStatus.SUCCEEDED)) {
            throw new IllegalArgumentException(
                    "predictedAnswerAllowed must follow prediction status");
        }
        if (directAnswerAllowed != prediction.status().terminal()) {
            throw new IllegalArgumentException(
                    "directAnswerAllowed must follow prediction status");
        }
    }

    public static EnsureTaskPredictionResult of(
            TaskPrediction prediction,
            boolean created
    ) {
        return new EnsureTaskPredictionResult(
                prediction,
                created,
                prediction.status() == TaskPredictionStatus.SUCCEEDED,
                prediction.status().terminal());
    }
}
