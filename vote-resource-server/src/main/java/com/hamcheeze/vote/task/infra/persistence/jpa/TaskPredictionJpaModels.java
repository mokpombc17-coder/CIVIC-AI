package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRuntimeStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.ColumnTransformer;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "task_predictions")
class TaskPredictionJpaEntity {

    @Id
    @Column(name = "prediction_id", nullable = false)
    private UUID id;

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    @Column(name = "user_id", nullable = false, length = 255)
    private String userId;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "persona_generation_id", nullable = false)
    private UUID personaGenerationId;

    @Column(name = "persona_id", nullable = false, length = 512)
    private String personaId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private TaskPredictionStatus status;

    @Column(name = "candidate_policy_version", nullable = false, length = 100)
    private String candidatePolicyVersion;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_retry_at")
    private Instant nextRetryAt;

    @Column(name = "last_error_code", length = 200)
    private String lastErrorCode;

    @Column(name = "last_error_message", length = 2000)
    private String lastErrorMessage;

    @Column(name = "runtime_status_code", length = 200)
    private String runtimeStatusCode;

    @Column(name = "runtime_status_detail", length = 2000)
    private String runtimeStatusDetail;

    @Column(name = "runtime_status_retryable")
    private Boolean runtimeStatusRetryable;

    @Column(name = "runtime_status_max_wait_minutes")
    private Integer runtimeStatusMaxWaitMinutes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "active_attempt_id")
    private UUID activeAttemptId;

    @Column(name = "processing_started_at")
    private Instant processingStartedAt;

    @Column(name = "lease_expires_at")
    private Instant leaseExpiresAt;

    protected TaskPredictionJpaEntity() {
    }

    TaskPredictionJpaEntity(TaskPrediction prediction) {
        id = prediction.id().value();
        rowVersion = 0;
        userId = prediction.userId().value();
        taskId = prediction.taskId().value();
        personaGenerationId = prediction.personaGenerationId().value();
        personaId = prediction.personaId().value();
        candidatePolicyVersion = prediction.candidatePolicyVersion();
        createdAt = prediction.createdAt();
        apply(prediction);
    }

    void apply(TaskPrediction prediction) {
        status = prediction.status();
        attemptCount = prediction.attemptCount();
        nextRetryAt = prediction.nextRetryAt();
        lastErrorCode = prediction.lastError() == null
                ? null : prediction.lastError().code();
        lastErrorMessage = prediction.lastError() == null
                ? null : prediction.lastError().message();
        TaskPredictionRuntimeStatus runtimeStatus = prediction.runtimeStatus();
        runtimeStatusCode = runtimeStatus == null ? null : runtimeStatus.code();
        runtimeStatusDetail = runtimeStatus == null
                ? null : runtimeStatus.detail();
        runtimeStatusRetryable = runtimeStatus == null
                ? null : runtimeStatus.retryable();
        runtimeStatusMaxWaitMinutes = runtimeStatus == null
                ? null : runtimeStatus.maxWaitMinutes();
        startedAt = prediction.startedAt();
        completedAt = prediction.completedAt();
        activeAttemptId = prediction.activeAttemptId() == null
                ? null : prediction.activeAttemptId().value();
        processingStartedAt = prediction.processingStartedAt();
        leaseExpiresAt = prediction.leaseExpiresAt();
    }

    UUID id() { return id; }
    long rowVersion() { return rowVersion; }
    String userId() { return userId; }
    UUID taskId() { return taskId; }
    UUID personaGenerationId() { return personaGenerationId; }
    String personaId() { return personaId; }
    TaskPredictionStatus status() { return status; }
    String candidatePolicyVersion() { return candidatePolicyVersion; }
    int attemptCount() { return attemptCount; }
    Instant nextRetryAt() { return nextRetryAt; }
    String lastErrorCode() { return lastErrorCode; }
    String lastErrorMessage() { return lastErrorMessage; }
    String runtimeStatusCode() { return runtimeStatusCode; }
    String runtimeStatusDetail() { return runtimeStatusDetail; }
    Boolean runtimeStatusRetryable() { return runtimeStatusRetryable; }
    Integer runtimeStatusMaxWaitMinutes() {
        return runtimeStatusMaxWaitMinutes;
    }
    Instant createdAt() { return createdAt; }
    Instant startedAt() { return startedAt; }
    Instant completedAt() { return completedAt; }
    UUID activeAttemptId() { return activeAttemptId; }
    Instant processingStartedAt() { return processingStartedAt; }
    Instant leaseExpiresAt() { return leaseExpiresAt; }
}

@Entity
@Table(name = "task_predicted_reasons")
class TaskPredictedReasonJpaEntity {

    @Id
    @Column(name = "predicted_reason_id", nullable = false)
    private UUID id;

    @Column(name = "prediction_id", nullable = false)
    private UUID predictionId;

    @Column(name = "option_id", nullable = false)
    private UUID optionId;

    @Column(name = "reason_order", nullable = false)
    private int reasonOrder;

    @Column(name = "reason", nullable = false, length = 500)
    private String reason;

    protected TaskPredictedReasonJpaEntity() {
    }

    TaskPredictedReasonJpaEntity(TaskPredictedReason predictedReason) {
        id = predictedReason.id().value();
        predictionId = predictedReason.predictionId().value();
        optionId = predictedReason.optionId().value();
        reasonOrder = predictedReason.reasonOrder();
        reason = predictedReason.reason();
    }

    UUID id() { return id; }
    UUID predictionId() { return predictionId; }
    UUID optionId() { return optionId; }
    int reasonOrder() { return reasonOrder; }
    String reason() { return reason; }
}

@Entity
@Table(name = "task_prediction_attempts")
class TaskPredictionAttemptJpaEntity {

    @Id
    @Column(name = "attempt_id", nullable = false)
    private UUID id;

    @Column(name = "prediction_id", nullable = false)
    private UUID predictionId;

    @Column(name = "attempt_number", nullable = false)
    private int attemptNumber;

    @Column(name = "request_id", nullable = false)
    private UUID requestId;

    @ColumnTransformer(write = "?::jsonb")
    @Column(name = "request_payload", nullable = false, columnDefinition = "jsonb")
    private String requestPayload;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "responded_at")
    private Instant respondedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "outcome", nullable = false, length = 40)
    private TaskPredictionAttemptOutcome outcome;

    @Column(name = "http_status")
    private Integer httpStatus;

    @ColumnTransformer(write = "?::jsonb")
    @Column(name = "response_payload", columnDefinition = "jsonb")
    private String responsePayload;

    @Column(name = "error_code", length = 200)
    private String errorCode;

    @Column(name = "error_message", length = 2000)
    private String errorMessage;

    @Column(name = "lease_expires_at")
    private Instant leaseExpiresAt;

    @Column(name = "worker_id", nullable = false, length = 255)
    private String workerId;

    @Column(name = "late_completion_observed_at")
    private Instant lateCompletionObservedAt;

    protected TaskPredictionAttemptJpaEntity() {
    }

    TaskPredictionAttemptJpaEntity(TaskPredictionAttempt attempt) {
        id = attempt.id().value();
        predictionId = attempt.predictionId().value();
        attemptNumber = attempt.attemptNumber();
        requestId = attempt.requestId().value();
        requestPayload = attempt.requestPayload().value();
        requestedAt = attempt.requestedAt();
        leaseExpiresAt = attempt.leaseExpiresAt();
        workerId = attempt.workerId();
        apply(attempt);
    }

    void apply(TaskPredictionAttempt attempt) {
        respondedAt = attempt.respondedAt();
        outcome = attempt.outcome();
        httpStatus = attempt.httpStatus();
        responsePayload = attempt.responsePayload() == null
                ? null : attempt.responsePayload().value();
        errorCode = attempt.errorCode();
        errorMessage = attempt.errorMessage();
        lateCompletionObservedAt = attempt.lateCompletionObservedAt();
    }

    void markLateCompletionObserved(Instant observedAt) {
        if (!outcome.completed()) {
            throw new IllegalStateException(
                    "only a completed attempt can observe late completion");
        }
        if (lateCompletionObservedAt == null) {
            lateCompletionObservedAt = observedAt;
        }
    }

    UUID id() { return id; }
    UUID predictionId() { return predictionId; }
    int attemptNumber() { return attemptNumber; }
    String requestPayload() { return requestPayload; }
    Instant requestedAt() { return requestedAt; }
    Instant respondedAt() { return respondedAt; }
    TaskPredictionAttemptOutcome outcome() { return outcome; }
    Integer httpStatus() { return httpStatus; }
    String responsePayload() { return responsePayload; }
    String errorCode() { return errorCode; }
    String errorMessage() { return errorMessage; }
    Instant leaseExpiresAt() { return leaseExpiresAt; }
    String workerId() { return workerId; }
    Instant lateCompletionObservedAt() { return lateCompletionObservedAt; }
}
