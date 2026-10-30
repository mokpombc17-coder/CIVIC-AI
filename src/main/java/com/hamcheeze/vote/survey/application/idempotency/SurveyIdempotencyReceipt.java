package com.hamcheeze.vote.survey.application.idempotency;

import com.hamcheeze.vote.survey.domain.common.SurveyReceiptId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class SurveyIdempotencyReceipt {

    private final SurveyReceiptId id;
    private final SurveyUserId userId;
    private final SurveyIdempotencyOperation operation;
    private final SurveyIdempotencyKey idempotencyKey;
    private final SurveyRequestHash requestHash;
    private final int outcomeSchemaVersion;
    private final Instant createdAt;
    private final Instant expiresAt;
    private SurveyIdempotencyReceiptStatus status;
    private Integer httpStatus;
    private String outcomePayload;
    private SurveyResponseId responseId;
    private Instant completedAt;

    private SurveyIdempotencyReceipt(
            SurveyReceiptId id,
            SurveyUserId userId,
            SurveyIdempotencyOperation operation,
            SurveyIdempotencyKey idempotencyKey,
            SurveyRequestHash requestHash,
            SurveyIdempotencyReceiptStatus status,
            int outcomeSchemaVersion,
            Integer httpStatus,
            String outcomePayload,
            SurveyResponseId responseId,
            Instant createdAt,
            Instant completedAt,
            Instant expiresAt
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.userId = Objects.requireNonNull(userId, "userId");
        this.operation = Objects.requireNonNull(operation, "operation");
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
        this.responseId = responseId;
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        this.completedAt = completedAt;
        this.expiresAt = expiresAt;
        validateState();
    }

    public static SurveyIdempotencyReceipt processing(
            SurveyReceiptId id,
            SurveyIdempotencyCommand command,
            Instant createdAt,
            Instant expiresAt
    ) {
        Objects.requireNonNull(command, "command");
        return new SurveyIdempotencyReceipt(
                id,
                command.userId(),
                command.operation(),
                command.idempotencyKey(),
                command.requestHash(),
                SurveyIdempotencyReceiptStatus.PROCESSING,
                command.outcomeSchemaVersion(),
                null,
                null,
                null,
                createdAt,
                null,
                expiresAt);
    }

    public static SurveyIdempotencyReceipt rehydrate(
            SurveyReceiptId id,
            SurveyUserId userId,
            SurveyIdempotencyOperation operation,
            SurveyIdempotencyKey idempotencyKey,
            SurveyRequestHash requestHash,
            SurveyIdempotencyReceiptStatus status,
            int outcomeSchemaVersion,
            Integer httpStatus,
            String outcomePayload,
            SurveyResponseId responseId,
            Instant createdAt,
            Instant completedAt,
            Instant expiresAt
    ) {
        return new SurveyIdempotencyReceipt(
                id, userId, operation, idempotencyKey, requestHash,
                status, outcomeSchemaVersion, httpStatus, outcomePayload,
                responseId, createdAt, completedAt, expiresAt);
    }

    public void complete(
            StoredSurveyIdempotencyOutcome outcome,
            Instant completionTime
    ) {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(completionTime, "completionTime");
        if (status != SurveyIdempotencyReceiptStatus.PROCESSING) {
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
                ? SurveyIdempotencyReceiptStatus.SUCCEEDED
                : SurveyIdempotencyReceiptStatus.REJECTED;
        httpStatus = outcome.httpStatus();
        outcomePayload = outcome.payload();
        responseId = outcome.responseId();
        completedAt = completionTime;
        validateState();
    }

    public StoredSurveyIdempotencyOutcome storedOutcome() {
        if (status == SurveyIdempotencyReceiptStatus.PROCESSING) {
            throw new IllegalStateException("receipt is still processing");
        }
        return new StoredSurveyIdempotencyOutcome(
                outcomeSchemaVersion,
                httpStatus,
                outcomePayload,
                responseId);
    }

    private void validateState() {
        if (expiresAt != null && !expiresAt.isAfter(createdAt)) {
            throw new IllegalArgumentException(
                    "expiresAt must be after createdAt");
        }
        if (status == SurveyIdempotencyReceiptStatus.PROCESSING) {
            if (httpStatus != null || outcomePayload != null
                    || responseId != null || completedAt != null) {
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
        new StoredSurveyIdempotencyOutcome(
                outcomeSchemaVersion,
                httpStatus,
                outcomePayload,
                responseId);
    }

    public SurveyReceiptId id() {
        return id;
    }

    public SurveyUserId userId() {
        return userId;
    }

    public SurveyIdempotencyOperation operation() {
        return operation;
    }

    public SurveyIdempotencyKey idempotencyKey() {
        return idempotencyKey;
    }

    public SurveyRequestHash requestHash() {
        return requestHash;
    }

    public SurveyIdempotencyReceiptStatus status() {
        return status;
    }

    public int outcomeSchemaVersion() {
        return outcomeSchemaVersion;
    }

    public Optional<Integer> optionalHttpStatus() {
        return Optional.ofNullable(httpStatus);
    }

    public Optional<String> optionalOutcomePayload() {
        return Optional.ofNullable(outcomePayload);
    }

    public Optional<SurveyResponseId> optionalResponseId() {
        return Optional.ofNullable(responseId);
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Optional<Instant> optionalCompletedAt() {
        return Optional.ofNullable(completedAt);
    }

    public Optional<Instant> optionalExpiresAt() {
        return Optional.ofNullable(expiresAt);
    }
}
