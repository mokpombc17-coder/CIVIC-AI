package com.hamcheeze.vote.survey.domain.persona;

import com.hamcheeze.vote.survey.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class PersonaGeneration {

    private final PersonaGenerationId id;
    private final SurveyResponseId sourceResponseId;
    private PersonaGenerationStatus status;
    private int attemptCount;
    private PersonaId personaId;
    private String lastErrorCode;
    private final Instant createdAt;
    private Instant processingStartedAt;
    private Instant completedAt;
    private Instant nextAttemptAt;
    private Instant updatedAt;

    private PersonaGeneration(
            PersonaGenerationId id,
            SurveyResponseId sourceResponseId,
            PersonaGenerationStatus status,
            int attemptCount,
            PersonaId personaId,
            String lastErrorCode,
            Instant createdAt,
            Instant processingStartedAt,
            Instant completedAt,
            Instant nextAttemptAt,
            Instant updatedAt
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.sourceResponseId = Objects.requireNonNull(
                sourceResponseId, "sourceResponseId");
        this.status = Objects.requireNonNull(status, "status");
        this.attemptCount = attemptCount;
        this.personaId = personaId;
        this.lastErrorCode = lastErrorCode;
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        this.processingStartedAt = processingStartedAt;
        this.completedAt = completedAt;
        this.nextAttemptAt = nextAttemptAt;
        this.updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
        validateConsistency();
    }

    public static PersonaGeneration pending(
            PersonaGenerationId id,
            SurveyResponseId sourceResponseId,
            Instant createdAt
    ) {
        Objects.requireNonNull(createdAt, "createdAt");
        return new PersonaGeneration(
                id,
                sourceResponseId,
                PersonaGenerationStatus.PENDING,
                0,
                null,
                null,
                createdAt,
                null,
                null,
                createdAt,
                createdAt);
    }

    public static PersonaGeneration restore(
            PersonaGenerationId id,
            SurveyResponseId sourceResponseId,
            PersonaGenerationStatus status,
            int attemptCount,
            PersonaId personaId,
            String lastErrorCode,
            Instant createdAt,
            Instant processingStartedAt,
            Instant completedAt,
            Instant nextAttemptAt,
            Instant updatedAt
    ) {
        return new PersonaGeneration(
                id, sourceResponseId, status, attemptCount, personaId,
                lastErrorCode, createdAt, processingStartedAt, completedAt,
                nextAttemptAt, updatedAt);
    }

    public void startProcessing(Instant startedAt) {
        Objects.requireNonNull(startedAt, "startedAt");
        if (!isDispatchableAt(startedAt)) {
            throw invalidTransition("generation is not ready for processing");
        }
        status = PersonaGenerationStatus.PROCESSING;
        attemptCount++;
        processingStartedAt = startedAt;
        completedAt = null;
        nextAttemptAt = null;
        lastErrorCode = null;
        updatedAt = startedAt;
        validateConsistency();
    }

    public void succeed(PersonaId issuedPersonaId, Instant succeededAt) {
        Objects.requireNonNull(issuedPersonaId, "issuedPersonaId");
        requireProcessing();
        requireNotBeforeProcessing(succeededAt, "succeededAt");
        status = PersonaGenerationStatus.SUCCEEDED;
        personaId = issuedPersonaId;
        lastErrorCode = null;
        completedAt = succeededAt;
        nextAttemptAt = null;
        updatedAt = succeededAt;
        validateConsistency();
    }

    public void fail(
            String errorCode,
            Instant failedAt,
            Instant retryAt
    ) {
        requireProcessing();
        requireNotBeforeProcessing(failedAt, "failedAt");
        String normalizedError = requireText(errorCode, "errorCode");
        if (retryAt != null && retryAt.isBefore(failedAt)) {
            throw SurveyDomainException.invariant(
                    "PERSONA_GENERATION_RETRY_TIME_INVALID",
                    "retryAt",
                    "retryAt must not be before failedAt");
        }
        status = PersonaGenerationStatus.FAILED;
        personaId = null;
        lastErrorCode = normalizedError;
        completedAt = null;
        nextAttemptAt = retryAt;
        updatedAt = failedAt;
        validateConsistency();
    }

    public boolean isDispatchableAt(Instant instant) {
        Objects.requireNonNull(instant, "instant");
        return (status == PersonaGenerationStatus.PENDING
                || status == PersonaGenerationStatus.FAILED)
                && nextAttemptAt != null
                && !nextAttemptAt.isAfter(instant);
    }

    public PersonaGenerationId id() {
        return id;
    }

    public SurveyResponseId sourceResponseId() {
        return sourceResponseId;
    }

    public PersonaGenerationStatus status() {
        return status;
    }

    public int attemptCount() {
        return attemptCount;
    }

    public Optional<PersonaId> personaId() {
        return Optional.ofNullable(personaId);
    }

    public Optional<String> lastErrorCode() {
        return Optional.ofNullable(lastErrorCode);
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Optional<Instant> processingStartedAt() {
        return Optional.ofNullable(processingStartedAt);
    }

    public Optional<Instant> completedAt() {
        return Optional.ofNullable(completedAt);
    }

    public Optional<Instant> nextAttemptAt() {
        return Optional.ofNullable(nextAttemptAt);
    }

    public Instant updatedAt() {
        return updatedAt;
    }

    private void requireProcessing() {
        if (status != PersonaGenerationStatus.PROCESSING) {
            throw invalidTransition("generation must be processing");
        }
    }

    private void requireNotBeforeProcessing(Instant instant, String field) {
        Objects.requireNonNull(instant, field);
        if (processingStartedAt == null
                || instant.isBefore(processingStartedAt)) {
            throw SurveyDomainException.invariant(
                    "PERSONA_GENERATION_TIME_INVALID",
                    field,
                    field + " must not be before processingStartedAt");
        }
    }

    private SurveyDomainException invalidTransition(String message) {
        return SurveyDomainException.invariant(
                "PERSONA_GENERATION_TRANSITION_NOT_ALLOWED",
                "status",
                message);
    }

    private void validateConsistency() {
        if (attemptCount < 0) {
            throw inconsistent("attemptCount must not be negative");
        }
        if (updatedAt.isBefore(createdAt)) {
            throw inconsistent("updatedAt must not be before createdAt");
        }
        if (processingStartedAt != null
                && processingStartedAt.isBefore(createdAt)) {
            throw inconsistent(
                    "processingStartedAt must not be before createdAt");
        }
        switch (status) {
            case PENDING -> validatePending();
            case PROCESSING -> validateProcessing();
            case SUCCEEDED -> validateSucceeded();
            case FAILED -> validateFailed();
        }
    }

    private void validatePending() {
        if (attemptCount != 0 || personaId != null || lastErrorCode != null
                || processingStartedAt != null || completedAt != null
                || nextAttemptAt == null) {
            throw inconsistent("pending generation fields are inconsistent");
        }
    }

    private void validateProcessing() {
        if (attemptCount < 1 || personaId != null || lastErrorCode != null
                || processingStartedAt == null || completedAt != null
                || nextAttemptAt != null) {
            throw inconsistent(
                    "processing generation fields are inconsistent");
        }
    }

    private void validateSucceeded() {
        if (attemptCount < 1 || personaId == null || lastErrorCode != null
                || processingStartedAt == null || completedAt == null
                || nextAttemptAt != null
                || completedAt.isBefore(processingStartedAt)) {
            throw inconsistent("succeeded generation fields are inconsistent");
        }
    }

    private void validateFailed() {
        if (attemptCount < 1 || personaId != null || lastErrorCode == null
                || lastErrorCode.isBlank() || processingStartedAt == null
                || completedAt != null) {
            throw inconsistent("failed generation fields are inconsistent");
        }
        if (nextAttemptAt != null && nextAttemptAt.isBefore(updatedAt)) {
            throw inconsistent("nextAttemptAt must not be before updatedAt");
        }
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw SurveyDomainException.invariant(
                    "PERSONA_GENERATION_TEXT_REQUIRED",
                    field,
                    field + " must not be blank");
        }
        return value;
    }

    private static SurveyDomainException inconsistent(String message) {
        return SurveyDomainException.invariant(
                "PERSONA_GENERATION_STATE_INCONSISTENT",
                "status",
                message);
    }
}
