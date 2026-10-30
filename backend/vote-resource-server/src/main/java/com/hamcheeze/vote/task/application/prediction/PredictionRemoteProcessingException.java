package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRuntimeStatus;

import java.util.Objects;

public final class PredictionRemoteProcessingException
        extends RuntimeException {

    private final int httpStatus;
    private final TaskPredictionRuntimeStatus runtimeStatus;
    private final SanitizedTaskPredictionPayload responsePayload;

    public PredictionRemoteProcessingException(
            int httpStatus,
            TaskPredictionRuntimeStatus runtimeStatus,
            SanitizedTaskPredictionPayload responsePayload
    ) {
        super(Objects.requireNonNull(runtimeStatus, "runtimeStatus").detail());
        if (httpStatus != 202) {
            throw new IllegalArgumentException("httpStatus must be 202");
        }
        this.httpStatus = httpStatus;
        this.runtimeStatus = runtimeStatus;
        this.responsePayload = responsePayload;
    }

    public int httpStatus() {
        return httpStatus;
    }

    public TaskPredictionRuntimeStatus runtimeStatus() {
        return runtimeStatus;
    }

    public SanitizedTaskPredictionPayload responsePayload() {
        return responsePayload;
    }
}
