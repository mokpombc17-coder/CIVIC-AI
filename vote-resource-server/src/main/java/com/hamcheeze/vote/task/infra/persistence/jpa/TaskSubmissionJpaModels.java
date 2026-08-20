package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionReceipt;
import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionReceiptStatus;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
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
@Table(name = "task_submissions")
class TaskSubmissionJpaEntity {

    @Id
    @Column(name = "submission_id", nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, length = 255)
    private String userId;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "persona_generation_id", nullable = false)
    private UUID personaGenerationId;

    @Column(name = "persona_version_id", nullable = false)
    private UUID personaVersionId;

    @Column(name = "prediction_id")
    private UUID predictionId;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Column(name = "selected_option_id", nullable = false)
    private UUID selectedOptionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "reason_source", nullable = false, length = 30)
    private TaskReasonSource reasonSource;

    @Column(name = "accepted_predicted_reason_id")
    private UUID acceptedPredictedReasonId;

    @Column(name = "final_reason", nullable = false, length = 500)
    private String finalReason;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    protected TaskSubmissionJpaEntity() {
    }

    TaskSubmissionJpaEntity(TaskSubmission submission) {
        id = submission.id().value();
        userId = submission.userId().value();
        taskId = submission.taskId().value();
        personaGenerationId = submission.personaGenerationId().value();
        personaVersionId = submission.personaVersionId().value();
        predictionId = submission.predictionId() == null
                ? null : submission.predictionId().value();
        questionId = submission.questionId().value();
        selectedOptionId = submission.selectedOptionId().value();
        reasonSource = submission.reasonSource();
        acceptedPredictedReasonId = submission.acceptedPredictedReasonId() == null
                ? null : submission.acceptedPredictedReasonId().value();
        finalReason = submission.finalReason();
        submittedAt = submission.submittedAt();
    }

    UUID id() { return id; }
    String userId() { return userId; }
    UUID taskId() { return taskId; }
    UUID personaGenerationId() { return personaGenerationId; }
    UUID personaVersionId() { return personaVersionId; }
    UUID predictionId() { return predictionId; }
    UUID questionId() { return questionId; }
    UUID selectedOptionId() { return selectedOptionId; }
    TaskReasonSource reasonSource() { return reasonSource; }
    UUID acceptedPredictedReasonId() { return acceptedPredictedReasonId; }
    String finalReason() { return finalReason; }
    Instant submittedAt() { return submittedAt; }
}

@Entity
@Table(name = "task_submission_receipts")
class TaskSubmissionReceiptJpaEntity {

    @Id
    @Column(name = "receipt_id", nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, length = 255)
    private String userId;

    @Column(name = "idempotency_key", nullable = false)
    private UUID idempotencyKey;

    @Column(name = "request_hash", nullable = false)
    private byte[] requestHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private TaskSubmissionReceiptStatus status;

    @Column(name = "outcome_schema_version", nullable = false)
    private int outcomeSchemaVersion;

    @Column(name = "http_status")
    private Integer httpStatus;

    @ColumnTransformer(write = "?::jsonb")
    @Column(name = "outcome", columnDefinition = "jsonb")
    private String outcome;

    @Column(name = "submission_id")
    private UUID submissionId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    protected TaskSubmissionReceiptJpaEntity() {
    }

    TaskSubmissionReceiptJpaEntity(TaskSubmissionReceipt receipt) {
        id = receipt.id().value();
        userId = receipt.userId().value();
        idempotencyKey = receipt.idempotencyKey().value();
        requestHash = receipt.requestHash().value();
        status = receipt.status();
        outcomeSchemaVersion = receipt.outcomeSchemaVersion();
        createdAt = receipt.createdAt();
        expiresAt = receipt.optionalExpiresAt().orElse(null);
        completeFrom(receipt);
    }

    void completeFrom(TaskSubmissionReceipt receipt) {
        status = receipt.status();
        httpStatus = receipt.optionalHttpStatus().orElse(null);
        outcome = receipt.optionalOutcomePayload().orElse(null);
        submissionId = receipt.optionalSubmissionId()
                .map(id -> id.value()).orElse(null);
        completedAt = receipt.optionalCompletedAt().orElse(null);
    }

    UUID id() { return id; }
    String userId() { return userId; }
    UUID idempotencyKey() { return idempotencyKey; }
    byte[] requestHash() { return requestHash; }
    TaskSubmissionReceiptStatus status() { return status; }
    int outcomeSchemaVersion() { return outcomeSchemaVersion; }
    Integer httpStatus() { return httpStatus; }
    String outcome() { return outcome; }
    UUID submissionId() { return submissionId; }
    Instant createdAt() { return createdAt; }
    Instant completedAt() { return completedAt; }
    Instant expiresAt() { return expiresAt; }
}
