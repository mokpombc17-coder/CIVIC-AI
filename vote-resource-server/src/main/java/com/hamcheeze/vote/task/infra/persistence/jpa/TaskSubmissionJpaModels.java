package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionReceipt;
import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionReceiptStatus;
import com.hamcheeze.vote.task.domain.submission.TaskAnswerSource;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswer;
import com.hamcheeze.vote.task.domain.task.TaskOptionKind;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;

import java.math.BigDecimal;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
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

    @Column(name = "prediction_id", nullable = false)
    private UUID predictionId;

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
        predictionId = submission.predictionId().value();
        submittedAt = submission.submittedAt();
    }

    UUID id() { return id; }
    String userId() { return userId; }
    UUID taskId() { return taskId; }
    UUID personaGenerationId() { return personaGenerationId; }
    UUID personaVersionId() { return personaVersionId; }
    UUID predictionId() { return predictionId; }
    Instant submittedAt() { return submittedAt; }
}

@Entity
@Table(name = "task_submission_answers")
@IdClass(TaskSubmissionAnswerJpaId.class)
class TaskSubmissionAnswerJpaEntity {

    @Id
    @Column(name = "submission_id", nullable = false)
    private UUID submissionId;

    @Id
    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "prediction_id", nullable = false)
    private UUID predictionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 30)
    private TaskAnswerSource source;

    @Column(name = "adopted_candidate_id")
    private UUID adoptedCandidateId;

    @Enumerated(EnumType.STRING)
    @Column(name = "answer_type", nullable = false, length = 30)
    private TaskQuestionType answerType;

    @Column(name = "text_value", length = 5000)
    private String textValue;

    @Column(name = "number_value", precision = 25, scale = 6)
    private BigDecimal numberValue;

    @Column(name = "scale_value")
    private Integer scaleValue;

    protected TaskSubmissionAnswerJpaEntity() {
    }

    TaskSubmissionAnswerJpaEntity(
            TaskSubmission submission,
            TaskSubmissionAnswer answer
    ) {
        TaskAnswerJpaCodec.EncodedAnswer encoded =
                TaskAnswerJpaCodec.encode(answer.finalAnswerValue());
        submissionId = submission.id().value();
        questionId = answer.questionId().value();
        taskId = submission.taskId().value();
        predictionId = submission.predictionId().value();
        source = answer.source();
        adoptedCandidateId = answer.adoptedPredictionCandidateId() == null
                ? null : answer.adoptedPredictionCandidateId().value();
        answerType = encoded.type();
        textValue = encoded.textValue();
        numberValue = encoded.numberValue();
        scaleValue = encoded.scaleValue();
    }

    UUID submissionId() { return submissionId; }
    UUID questionId() { return questionId; }
    TaskAnswerSource source() { return source; }
    UUID adoptedCandidateId() { return adoptedCandidateId; }
    TaskQuestionType answerType() { return answerType; }
    String textValue() { return textValue; }
    BigDecimal numberValue() { return numberValue; }
    Integer scaleValue() { return scaleValue; }
}

@Entity
@Table(name = "task_submission_answer_selections")
@IdClass(TaskSubmissionAnswerSelectionJpaId.class)
class TaskSubmissionAnswerSelectionJpaEntity {

    @Id
    @Column(name = "submission_id", nullable = false)
    private UUID submissionId;

    @Id
    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Id
    @Column(name = "option_id", nullable = false)
    private UUID optionId;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "prediction_id", nullable = false)
    private UUID predictionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "answer_type", nullable = false, length = 30)
    private TaskQuestionType answerType;

    @Enumerated(EnumType.STRING)
    @Column(name = "option_kind", nullable = false, length = 30)
    private TaskOptionKind optionKind;

    @Column(name = "other_text", length = 500)
    private String otherText;

    protected TaskSubmissionAnswerSelectionJpaEntity() {
    }

    TaskSubmissionAnswerSelectionJpaEntity(
            TaskSubmission submission,
            TaskSubmissionAnswer answer,
            UUID optionId,
            TaskOptionKind optionKind,
            String otherText
    ) {
        submissionId = submission.id().value();
        questionId = answer.questionId().value();
        this.optionId = optionId;
        taskId = submission.taskId().value();
        predictionId = submission.predictionId().value();
        answerType = answer.finalAnswerValue().questionType();
        this.optionKind = optionKind;
        this.otherText = otherText;
    }

    UUID submissionId() { return submissionId; }
    UUID questionId() { return questionId; }
    UUID optionId() { return optionId; }
    TaskOptionKind optionKind() { return optionKind; }
    String otherText() { return otherText; }
}

class TaskSubmissionAnswerJpaId implements Serializable {
    private UUID submissionId;
    private UUID questionId;

    public TaskSubmissionAnswerJpaId() {
    }

    @Override
    public boolean equals(Object other) {
        return this == other
                || other instanceof TaskSubmissionAnswerJpaId that
                && Objects.equals(submissionId, that.submissionId)
                && Objects.equals(questionId, that.questionId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(submissionId, questionId);
    }
}

class TaskSubmissionAnswerSelectionJpaId implements Serializable {
    private UUID submissionId;
    private UUID questionId;
    private UUID optionId;

    public TaskSubmissionAnswerSelectionJpaId() {
    }

    @Override
    public boolean equals(Object other) {
        return this == other
                || other instanceof TaskSubmissionAnswerSelectionJpaId that
                && Objects.equals(submissionId, that.submissionId)
                && Objects.equals(questionId, that.questionId)
                && Objects.equals(optionId, that.optionId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(submissionId, questionId, optionId);
    }
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
