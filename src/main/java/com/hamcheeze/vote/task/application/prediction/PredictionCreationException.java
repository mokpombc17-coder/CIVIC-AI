package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRuntimeStatus;

import java.util.Objects;

public final class PredictionCreationException extends RuntimeException {

    private final TaskPredictionAttemptOutcome outcome;
    private final boolean retryable;
    private final Integer httpStatus;
    private final String errorCode;
    private final SanitizedTaskPredictionPayload responsePayload;
    private final TaskPredictionRuntimeStatus runtimeStatus;

    public PredictionCreationException(
            TaskPredictionAttemptOutcome outcome,
            boolean retryable,
            Integer httpStatus,
            String errorCode,
            String message,
            SanitizedTaskPredictionPayload responsePayload,
            Throwable cause
    ) {
        this(outcome, retryable, httpStatus, errorCode, message,
                responsePayload, null, cause);
    }

    public PredictionCreationException(
            TaskPredictionAttemptOutcome outcome,
            boolean retryable,
            Integer httpStatus,
            String errorCode,
            String message,
            SanitizedTaskPredictionPayload responsePayload,
            TaskPredictionRuntimeStatus runtimeStatus,
            Throwable cause
    ) {
        super(message, cause);
        this.outcome = requireFailureOutcome(outcome);
        this.retryable = retryable;
        if (httpStatus != null && (httpStatus < 100 || httpStatus > 599)) {
            throw new IllegalArgumentException(
                    "httpStatus must be between 100 and 599");
        }
        this.httpStatus = httpStatus;
        if (errorCode == null || errorCode.isBlank()) {
            throw new IllegalArgumentException("errorCode must not be blank");
        }
        this.errorCode = errorCode.trim();
        this.responsePayload = responsePayload;
        this.runtimeStatus = runtimeStatus;
    }

    public TaskPredictionAttemptOutcome outcome() {
        return outcome;
    }

    public boolean retryable() {
        return retryable;
    }

    public Integer httpStatus() {
        return httpStatus;
    }

    public String errorCode() {
        return errorCode;
    }

    public SanitizedTaskPredictionPayload responsePayload() {
        return responsePayload;
    }

    public TaskPredictionRuntimeStatus runtimeStatus() {
        return runtimeStatus;
    }

    private static TaskPredictionAttemptOutcome requireFailureOutcome(
            TaskPredictionAttemptOutcome outcome
    ) {
        Objects.requireNonNull(outcome, "outcome");
        return switch (outcome) {
            case TIMEOUT, NETWORK_ERROR, HTTP_ERROR, INVALID_RESPONSE ->
                    outcome;
            default -> throw new IllegalArgumentException(
                    "outcome must describe a prediction creation failure");
        };
    }
}
