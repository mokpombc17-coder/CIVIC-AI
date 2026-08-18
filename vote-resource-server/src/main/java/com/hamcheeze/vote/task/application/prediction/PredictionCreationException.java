package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;

import java.util.Objects;

public final class PredictionCreationException extends RuntimeException {

    private final TaskPredictionAttemptOutcome outcome;
    private final boolean retryable;
    private final Integer httpStatus;
    private final String errorCode;
    private final SanitizedTaskPredictionPayload responsePayload;

    public PredictionCreationException(
            TaskPredictionAttemptOutcome outcome,
            boolean retryable,
            Integer httpStatus,
            String errorCode,
            String message,
            SanitizedTaskPredictionPayload responsePayload,
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
