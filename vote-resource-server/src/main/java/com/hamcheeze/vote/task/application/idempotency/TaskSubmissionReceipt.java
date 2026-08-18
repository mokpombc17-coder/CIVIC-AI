package com.hamcheeze.vote.task.application.idempotency;

import com.hamcheeze.vote.task.domain.common.TaskReceiptId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class TaskSubmissionReceipt {

    private final TaskReceiptId id;
    private final TaskUserId userId;
    private final TaskIdempotencyKey idempotencyKey;
    private final TaskRequestHash requestHash;
    private final int outcomeSchemaVersion;
    private final Instant createdAt;
    private final Instant expiresAt;
    private TaskSubmissionReceiptStatus status;
    private Integer httpStatus;
    private String outcomePayload;
    private TaskSubmissionId submissionId;
    private Instant completedAt;

    private TaskSubmissionReceipt(
            TaskReceiptId id,
            TaskUserId userId,
            TaskIdempotencyKey idempotencyKey,
            TaskRequestHash requestHash,
            TaskSubmissionReceiptStatus status,
            int outcomeSchemaVersion,
            Integer httpStatus,
            String outcomePayload,
            TaskSubmissionId submissionId,
            Instant createdAt,
            Instant completedAt,
            Instant expiresAt
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.userId = Objects.requireNonNull(userId, "userId");
        this.idempotencyKey = Objects.requireNonNull(
                idempotencyKey, "idempotencyKey");
        this.requestHash = Objects.requireNonNull(requestHash, "requestHash");
        this.status = Objects.requireNonNull(status, "status");
        if (outcomeSchemaVersion <= 0) {
            throw new IllegalArgumentException(
                    "outcomeSchemaVersion must be positive");
        }
        this.outcomeSchemaVersion = outcomeSchemaVersion;
        this.httpStatus = httpStatus;
        this.outcomePayload = outcomePayload;
        this.submissionId = submissionId;
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        this.completedAt = completedAt;
        this.expiresAt = expiresAt;
        validateState();
    }

    public static TaskSubmissionReceipt processing(
            TaskReceiptId id,
            TaskUserId userId,
            TaskIdempotencyKey idempotencyKey,
            TaskRequestHash requestHash,
            int outcomeSchemaVersion,
            Instant createdAt,
            Instant expiresAt
    ) {
        return new TaskSubmissionReceipt(
                id, userId, idempotencyKey, requestHash,
                TaskSubmissionReceiptStatus.PROCESSING,
                outcomeSchemaVersion, null, null, null,
                createdAt, null, expiresAt);
    }

    public static TaskSubmissionReceipt rehydrate(
            TaskReceiptId id,
            TaskUserId userId,
            TaskIdempotencyKey idempotencyKey,
            TaskRequestHash requestHash,
            TaskSubmissionReceiptStatus status,
            int outcomeSchemaVersion,
            Integer httpStatus,
            String outcomePayload,
            TaskSubmissionId submissionId,
            Instant createdAt,
            Instant completedAt,
            Instant expiresAt
    ) {
        return new TaskSubmissionReceipt(
                id, userId, idempotencyKey, requestHash, status,
                outcomeSchemaVersion, httpStatus, outcomePayload,
                submissionId, createdAt, completedAt, expiresAt);
    }

    public void complete(
            StoredTaskSubmissionOutcome outcome,
            Instant completionTime
    ) {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(completionTime, "completionTime");
        if (status != TaskSubmissionReceiptStatus.PROCESSING) {
            throw new IllegalStateException("receipt is already completed");
        }
        if (outcome.schemaVersion() != outcomeSchemaVersion) {
            throw new IllegalArgumentException(
                    "outcome schema version must match receipt");
        }
        if (completionTime.isBefore(createdAt)) {
            throw new IllegalArgumentException(
                    "completionTime must not be before createdAt");
        }
        status = outcome.succeeded()
                ? TaskSubmissionReceiptStatus.SUCCEEDED
                : TaskSubmissionReceiptStatus.REJECTED;
        httpStatus = outcome.httpStatus();
        outcomePayload = outcome.payload();
        submissionId = outcome.submissionId();
        completedAt = completionTime;
        validateState();
    }

    public StoredTaskSubmissionOutcome storedOutcome() {
        if (status == TaskSubmissionReceiptStatus.PROCESSING) {
            throw new IllegalStateException("receipt is still processing");
        }
        return new StoredTaskSubmissionOutcome(
                outcomeSchemaVersion, httpStatus, outcomePayload, submissionId);
    }

    private void validateState() {
        if (expiresAt != null && !expiresAt.isAfter(createdAt)) {
            throw new IllegalArgumentException(
                    "expiresAt must be after createdAt");
        }
        if (status == TaskSubmissionReceiptStatus.PROCESSING) {
            if (httpStatus != null || outcomePayload != null
                    || submissionId != null || completedAt != null) {
                throw new IllegalArgumentException(
                        "processing receipt must not have an outcome");
            }
            return;
        }
        if (httpStatus == null || outcomePayload == null
                || completedAt == null || completedAt.isBefore(createdAt)) {
            throw new IllegalArgumentException(
                    "completed receipt requires a valid outcome");
        }
        new StoredTaskSubmissionOutcome(
                outcomeSchemaVersion, httpStatus, outcomePayload, submissionId);
    }

    public TaskReceiptId id() { return id; }
    public TaskUserId userId() { return userId; }
    public TaskIdempotencyKey idempotencyKey() { return idempotencyKey; }
    public TaskRequestHash requestHash() { return requestHash; }
    public TaskSubmissionReceiptStatus status() { return status; }
    public int outcomeSchemaVersion() { return outcomeSchemaVersion; }
    public Optional<Integer> optionalHttpStatus() { return Optional.ofNullable(httpStatus); }
    public Optional<String> optionalOutcomePayload() { return Optional.ofNullable(outcomePayload); }
    public Optional<TaskSubmissionId> optionalSubmissionId() { return Optional.ofNullable(submissionId); }
    public Instant createdAt() { return createdAt; }
    public Optional<Instant> optionalCompletedAt() { return Optional.ofNullable(completedAt); }
    public Optional<Instant> optionalExpiresAt() { return Optional.ofNullable(expiresAt); }
}
