package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyOperation;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyReceipt;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyReceiptStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "survey_idempotency_receipts")
class SurveyIdempotencyJpaEntity {

    @Id
    @Column(name = "receipt_id", nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, length = 255)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "operation", nullable = false, length = 100)
    private SurveyIdempotencyOperation operation;

    @Column(name = "idempotency_key", nullable = false)
    private UUID idempotencyKey;

    @Column(name = "request_hash", nullable = false)
    private byte[] requestHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private SurveyIdempotencyReceiptStatus status;

    @Column(name = "outcome_schema_version", nullable = false)
    private int outcomeSchemaVersion;

    @Column(name = "http_status")
    private Integer httpStatus;

    @Column(name = "outcome", columnDefinition = "jsonb")
    @ColumnTransformer(write = "CAST(? AS jsonb)")
    private String outcome;

    @Column(name = "response_id")
    private UUID responseId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    protected SurveyIdempotencyJpaEntity() {
    }

    SurveyIdempotencyJpaEntity(SurveyIdempotencyReceipt receipt) {
        id = receipt.id().value();
        userId = receipt.userId().value();
        operation = receipt.operation();
        idempotencyKey = receipt.idempotencyKey().value();
        requestHash = receipt.requestHash().value();
        status = receipt.status();
        outcomeSchemaVersion = receipt.outcomeSchemaVersion();
        httpStatus = receipt.optionalHttpStatus().orElse(null);
        outcome = receipt.optionalOutcomePayload().orElse(null);
        responseId = receipt.optionalResponseId()
                .map(value -> value.value())
                .orElse(null);
        createdAt = receipt.createdAt();
        completedAt = receipt.optionalCompletedAt().orElse(null);
        expiresAt = receipt.optionalExpiresAt().orElse(null);
    }

    void completeFrom(SurveyIdempotencyReceipt receipt) {
        if (!id.equals(receipt.id().value())) {
            throw new IllegalArgumentException("receipt ID must match");
        }
        status = receipt.status();
        httpStatus = receipt.optionalHttpStatus().orElse(null);
        outcome = receipt.optionalOutcomePayload().orElse(null);
        responseId = receipt.optionalResponseId()
                .map(value -> value.value())
                .orElse(null);
        completedAt = receipt.optionalCompletedAt().orElse(null);
        expiresAt = receipt.optionalExpiresAt().orElse(null);
    }

    UUID id() {
        return id;
    }

    String userId() {
        return userId;
    }

    SurveyIdempotencyOperation operation() {
        return operation;
    }

    UUID idempotencyKey() {
        return idempotencyKey;
    }

    byte[] requestHash() {
        return requestHash;
    }

    SurveyIdempotencyReceiptStatus status() {
        return status;
    }

    int outcomeSchemaVersion() {
        return outcomeSchemaVersion;
    }

    Integer httpStatus() {
        return httpStatus;
    }

    String outcome() {
        return outcome;
    }

    UUID responseId() {
        return responseId;
    }

    Instant createdAt() {
        return createdAt;
    }

    Instant completedAt() {
        return completedAt;
    }

    Instant expiresAt() {
        return expiresAt;
    }
}
