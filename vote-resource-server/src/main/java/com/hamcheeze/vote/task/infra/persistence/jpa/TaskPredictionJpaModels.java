package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.task.TaskOptionKind;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.ColumnTransformer;

import java.math.BigDecimal;
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

    @Column(name = "persona_version_id", nullable = false)
    private UUID personaVersionId;

    @Column(name = "persona_id", nullable = false, length = 512)
    private String personaId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private TaskPredictionStatus status;

    @Column(name = "candidate_policy_version", nullable = false, length = 100)
    private String candidatePolicyVersion;

    @Column(name = "requested_candidate_count", nullable = false)
    private int requestedCandidateCount;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_retry_at")
    private Instant nextRetryAt;

    @Column(name = "last_error_code", length = 200)
    private String lastErrorCode;

    @Column(name = "last_error_message", length = 2000)
    private String lastErrorMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected TaskPredictionJpaEntity() {
    }

    TaskPredictionJpaEntity(TaskPrediction prediction) {
        id = prediction.id().value();
        rowVersion = 0;
        userId = prediction.userId().value();
        taskId = prediction.taskId().value();
        personaGenerationId = prediction.personaGenerationId().value();
        personaVersionId = prediction.personaVersionId().value();
        personaId = prediction.personaId().value();
        candidatePolicyVersion = prediction.candidatePolicyVersion();
        requestedCandidateCount = prediction.requestedCandidateCount();
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
        startedAt = prediction.startedAt();
        completedAt = prediction.completedAt();
    }

    UUID id() { return id; }
    long rowVersion() { return rowVersion; }
    String userId() { return userId; }
    UUID taskId() { return taskId; }
    UUID personaGenerationId() { return personaGenerationId; }
    UUID personaVersionId() { return personaVersionId; }
    String personaId() { return personaId; }
    TaskPredictionStatus status() { return status; }
    String candidatePolicyVersion() { return candidatePolicyVersion; }
    int requestedCandidateCount() { return requestedCandidateCount; }
    int attemptCount() { return attemptCount; }
    Instant nextRetryAt() { return nextRetryAt; }
    String lastErrorCode() { return lastErrorCode; }
    String lastErrorMessage() { return lastErrorMessage; }
    Instant createdAt() { return createdAt; }
    Instant startedAt() { return startedAt; }
    Instant completedAt() { return completedAt; }
}

@Entity
@Table(name = "task_prediction_candidates")
class TaskPredictionCandidateJpaEntity {

    @Id
    @Column(name = "candidate_id", nullable = false)
    private UUID id;

    @Column(name = "prediction_id", nullable = false)
    private UUID predictionId;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Column(name = "candidate_order", nullable = false)
    private int candidateOrder;

    @Column(name = "slot_option_id")
    private UUID slotOptionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "answer_type", nullable = false, length = 30)
    private TaskQuestionType answerType;

    @Column(name = "text_value", length = 5000)
    private String textValue;

    @Column(name = "number_value", precision = 25, scale = 6)
    private BigDecimal numberValue;

    @Column(name = "scale_value")
    private Integer scaleValue;

    @Column(name = "rationale", nullable = false, length = 500)
    private String rationale;

    protected TaskPredictionCandidateJpaEntity() {
    }

    TaskPredictionCandidateJpaEntity(
            UUID taskId,
            TaskPredictionCandidate candidate
    ) {
        TaskAnswerJpaCodec.EncodedAnswer answer =
                TaskAnswerJpaCodec.encode(candidate.answerValue());
        id = candidate.id().value();
        predictionId = candidate.predictionId().value();
        this.taskId = taskId;
        questionId = candidate.questionId().value();
        candidateOrder = candidate.candidateOrder();
        slotOptionId = candidate.answerValue() instanceof SingleChoiceValue single
                ? single.selection().optionId().value() : null;
        answerType = answer.type();
        textValue = answer.textValue();
        numberValue = answer.numberValue();
        scaleValue = answer.scaleValue();
        rationale = candidate.rationale();
    }

    UUID id() { return id; }
    UUID predictionId() { return predictionId; }
    UUID taskId() { return taskId; }
    UUID questionId() { return questionId; }
    int candidateOrder() { return candidateOrder; }
    TaskQuestionType answerType() { return answerType; }
    String textValue() { return textValue; }
    BigDecimal numberValue() { return numberValue; }
    Integer scaleValue() { return scaleValue; }
    String rationale() { return rationale; }
}

@Entity
@Table(name = "task_prediction_candidate_selections")
class TaskPredictionCandidateSelectionJpaEntity {

    @Id
    @Column(name = "selection_id", nullable = false)
    private UUID id;

    @Column(name = "candidate_id", nullable = false)
    private UUID candidateId;

    @Column(name = "prediction_id", nullable = false)
    private UUID predictionId;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "answer_type", nullable = false, length = 30)
    private TaskQuestionType answerType;

    @Column(name = "option_id", nullable = false)
    private UUID optionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "option_kind", nullable = false, length = 30)
    private TaskOptionKind optionKind;

    @Column(name = "other_text", length = 500)
    private String otherText;

    protected TaskPredictionCandidateSelectionJpaEntity() {
    }

    TaskPredictionCandidateSelectionJpaEntity(
            UUID candidateId,
            UUID predictionId,
            UUID taskId,
            UUID questionId,
            TaskQuestionType answerType,
            UUID optionId,
            TaskOptionKind optionKind,
            String otherText
    ) {
        id = UUID.randomUUID();
        this.candidateId = candidateId;
        this.predictionId = predictionId;
        this.taskId = taskId;
        this.questionId = questionId;
        this.answerType = answerType;
        this.optionId = optionId;
        this.optionKind = optionKind;
        this.otherText = otherText;
    }

    UUID candidateId() { return candidateId; }
    UUID optionId() { return optionId; }
    TaskOptionKind optionKind() { return optionKind; }
    String otherText() { return otherText; }
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

    protected TaskPredictionAttemptJpaEntity() {
    }

    TaskPredictionAttemptJpaEntity(TaskPredictionAttempt attempt) {
        id = attempt.id().value();
        predictionId = attempt.predictionId().value();
        attemptNumber = attempt.attemptNumber();
        requestId = attempt.requestId().value();
        requestPayload = attempt.requestPayload().value();
        requestedAt = attempt.requestedAt();
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
}
