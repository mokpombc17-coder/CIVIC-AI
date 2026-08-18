package com.hamcheeze.vote.task.domain.prediction;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskText;

import java.time.Instant;
import java.util.Objects;

public final class TaskPredictionAttempt {

    private final TaskPredictionAttemptId id;
    private final TaskPredictionId predictionId;
    private final int attemptNumber;
    private final SanitizedTaskPredictionPayload requestPayload;
    private final Instant requestedAt;
    private final Instant respondedAt;
    private final TaskPredictionAttemptOutcome outcome;
    private final Integer httpStatus;
    private final SanitizedTaskPredictionPayload responsePayload;
    private final String errorCode;
    private final String errorMessage;

    private TaskPredictionAttempt(
            TaskPredictionAttemptId id,
            TaskPredictionId predictionId,
            int attemptNumber,
            SanitizedTaskPredictionPayload requestPayload,
            Instant requestedAt,
            Instant respondedAt,
            TaskPredictionAttemptOutcome outcome,
            Integer httpStatus,
            SanitizedTaskPredictionPayload responsePayload,
            String errorCode,
            String errorMessage
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.predictionId = Objects.requireNonNull(predictionId, "predictionId");
        if (attemptNumber < 1) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_ATTEMPT_NUMBER_INVALID",
                    "attemptNumber",
                    "attemptNumber must be positive");
        }
        this.attemptNumber = attemptNumber;
        this.requestPayload = Objects.requireNonNull(
                requestPayload, "requestPayload");
        this.requestedAt = Objects.requireNonNull(requestedAt, "requestedAt");
        this.respondedAt = respondedAt;
        this.outcome = Objects.requireNonNull(outcome, "outcome");
        this.httpStatus = validateHttpStatus(httpStatus);
        this.responsePayload = responsePayload;
        this.errorCode = TaskText.optional(
                errorCode, 200, "TASK_PREDICTION_ERROR_CODE", "errorCode");
        this.errorMessage = TaskText.optional(
                errorMessage, 2_000,
                "TASK_PREDICTION_ERROR_MESSAGE", "errorMessage");
        validateConsistency();
    }

    public static TaskPredictionAttempt started(
            TaskPredictionAttemptId id,
            TaskPredictionId predictionId,
            int attemptNumber,
            SanitizedTaskPredictionPayload requestPayload,
            Instant requestedAt
    ) {
        return new TaskPredictionAttempt(
                id, predictionId, attemptNumber, requestPayload, requestedAt,
                null, TaskPredictionAttemptOutcome.IN_PROGRESS,
                null, null, null, null);
    }

    public TaskPredictionAttempt complete(
            TaskPredictionAttemptOutcome completedOutcome,
            Integer httpStatus,
            SanitizedTaskPredictionPayload responsePayload,
            String errorCode,
            String errorMessage,
            Instant responseTime
    ) {
        if (outcome.completed()) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_ATTEMPT_ALREADY_COMPLETED",
                    "outcome",
                    "completed attempt is immutable");
        }
        if (completedOutcome == TaskPredictionAttemptOutcome.IN_PROGRESS) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_ATTEMPT_OUTCOME_INVALID",
                    "outcome",
                    "completion outcome must be terminal");
        }
        return new TaskPredictionAttempt(
                id, predictionId, attemptNumber, requestPayload, requestedAt,
                responseTime, completedOutcome, httpStatus, responsePayload,
                errorCode, errorMessage);
    }

    public TaskPredictionAttemptId id() { return id; }
    public TaskPredictionId predictionId() { return predictionId; }
    public TaskPredictionId requestId() { return predictionId; }
    public int attemptNumber() { return attemptNumber; }
    public SanitizedTaskPredictionPayload requestPayload() { return requestPayload; }
    public Instant requestedAt() { return requestedAt; }
    public Instant respondedAt() { return respondedAt; }
    public TaskPredictionAttemptOutcome outcome() { return outcome; }
    public Integer httpStatus() { return httpStatus; }
    public SanitizedTaskPredictionPayload responsePayload() { return responsePayload; }
    public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; }

    private void validateConsistency() {
        if (!outcome.completed()) {
            if (respondedAt != null || httpStatus != null
                    || responsePayload != null || errorCode != null
                    || errorMessage != null) {
                throw inconsistent("in-progress attempt has completion fields");
            }
            return;
        }
        if (respondedAt == null || respondedAt.isBefore(requestedAt)) {
            throw inconsistent(
                    "completed attempt requires a valid respondedAt");
        }
        if (outcome == TaskPredictionAttemptOutcome.SUCCEEDED
                && responsePayload == null) {
            throw inconsistent(
                    "successful attempt requires responsePayload");
        }
        if (outcome == TaskPredictionAttemptOutcome.SUCCEEDED
                && (errorCode != null || errorMessage != null)) {
            throw inconsistent(
                    "successful attempt must not have error fields");
        }
    }

    private static Integer validateHttpStatus(Integer status) {
        if (status != null && (status < 100 || status > 599)) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_HTTP_STATUS_INVALID",
                    "httpStatus",
                    "httpStatus must be between 100 and 599");
        }
        return status;
    }

    private static TaskDomainException inconsistent(String message) {
        return TaskDomainException.invariant(
                "TASK_PREDICTION_ATTEMPT_INCONSISTENT",
                "outcome",
                message);
    }
}
