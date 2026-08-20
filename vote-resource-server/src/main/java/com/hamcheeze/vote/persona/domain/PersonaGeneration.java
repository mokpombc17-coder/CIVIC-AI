package com.hamcheeze.vote.persona.domain;

import com.hamcheeze.vote.persona.domain.common.PersonaDomainException;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class PersonaGeneration {

    private final PersonaGenerationId id;
    private final PersonaSourceType sourceType;
    private final PersonaSourceId sourceId;
    private PersonaGenerationStatus status;
    private int attemptCount;
    private PersonaId personaId;
    private String lastErrorCode;
    private final Instant createdAt;
    private Instant processingStartedAt;
    private Instant completedAt;
    private Instant nextAttemptAt;
    private PersonaGenerationClaimToken claimToken;
    private Instant leaseExpiresAt;
    private Instant updatedAt;

    private PersonaGeneration(
            PersonaGenerationId id,
            PersonaSourceType sourceType,
            PersonaSourceId sourceId,
            PersonaGenerationStatus status,
            int attemptCount,
            PersonaId personaId,
            String lastErrorCode,
            Instant createdAt,
            Instant processingStartedAt,
            Instant completedAt,
            Instant nextAttemptAt,
            PersonaGenerationClaimToken claimToken,
            Instant leaseExpiresAt,
            Instant updatedAt
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.sourceType = Objects.requireNonNull(sourceType, "sourceType");
        this.sourceId = Objects.requireNonNull(sourceId, "sourceId");
        this.status = Objects.requireNonNull(status, "status");
        this.attemptCount = attemptCount;
        this.personaId = personaId;
        this.lastErrorCode = lastErrorCode;
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        this.processingStartedAt = processingStartedAt;
        this.completedAt = completedAt;
        this.nextAttemptAt = nextAttemptAt;
        this.claimToken = claimToken;
        this.leaseExpiresAt = leaseExpiresAt;
        this.updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
        validateConsistency();
    }

    public static PersonaGeneration pending(
            PersonaGenerationId id,
            PersonaSourceType sourceType,
            PersonaSourceId sourceId,
            Instant createdAt
    ) {
        return new PersonaGeneration(
                id, sourceType, sourceId, PersonaGenerationStatus.PENDING,
                0, null, null, createdAt, null, null, createdAt,
                null, null, createdAt);
    }

    public static PersonaGeneration restore(
            PersonaGenerationId id,
            PersonaSourceType sourceType,
            PersonaSourceId sourceId,
            PersonaGenerationStatus status,
            int attemptCount,
            PersonaId personaId,
            String lastErrorCode,
            Instant createdAt,
            Instant processingStartedAt,
            Instant completedAt,
            Instant nextAttemptAt,
            PersonaGenerationClaimToken claimToken,
            Instant leaseExpiresAt,
            Instant updatedAt
    ) {
        return new PersonaGeneration(
                id, sourceType, sourceId, status, attemptCount, personaId,
                lastErrorCode, createdAt, processingStartedAt, completedAt,
                nextAttemptAt, claimToken, leaseExpiresAt, updatedAt);
    }

    public void claim(
            PersonaGenerationClaimToken token,
            Instant startedAt,
            Instant expiresAt
    ) {
        Objects.requireNonNull(token, "token");
        Objects.requireNonNull(startedAt, "startedAt");
        Objects.requireNonNull(expiresAt, "expiresAt");
        if (!isDispatchableAt(startedAt)) {
            throw invalidTransition("generation is not dispatchable");
        }
        if (!expiresAt.isAfter(startedAt)) {
            throw PersonaDomainException.invariant(
                    "PERSONA_GENERATION_LEASE_INVALID",
                    "leaseExpiresAt",
                    "leaseExpiresAt must be after processingStartedAt");
        }
        status = PersonaGenerationStatus.PROCESSING;
        attemptCount++;
        personaId = null;
        lastErrorCode = null;
        processingStartedAt = startedAt;
        completedAt = null;
        nextAttemptAt = null;
        claimToken = token;
        leaseExpiresAt = expiresAt;
        updatedAt = startedAt;
        validateConsistency();
    }

    public boolean succeed(
            PersonaGenerationClaimToken token,
            PersonaId succeededPersonaId,
            Instant succeededAt
    ) {
        if (!ownsActiveClaim(token)) {
            return false;
        }
        Objects.requireNonNull(succeededPersonaId, "succeededPersonaId");
        requireNotBeforeProcessing(succeededAt, "succeededAt");
        status = PersonaGenerationStatus.SUCCEEDED;
        personaId = succeededPersonaId;
        lastErrorCode = null;
        completedAt = succeededAt;
        nextAttemptAt = null;
        claimToken = null;
        leaseExpiresAt = null;
        updatedAt = succeededAt;
        validateConsistency();
        return true;
    }

    public boolean fail(
            PersonaGenerationClaimToken token,
            String errorCode,
            Instant failedAt,
            Instant retryAt
    ) {
        if (!ownsActiveClaim(token)) {
            return false;
        }
        requireNotBeforeProcessing(failedAt, "failedAt");
        String normalizedError = requireText(errorCode, "errorCode");
        if (retryAt != null && retryAt.isBefore(failedAt)) {
            throw PersonaDomainException.invariant(
                    "PERSONA_GENERATION_RETRY_TIME_INVALID",
                    "retryAt",
                    "retryAt must not be before failedAt");
        }
        status = PersonaGenerationStatus.FAILED;
        personaId = null;
        lastErrorCode = normalizedError;
        completedAt = null;
        nextAttemptAt = retryAt;
        claimToken = null;
        leaseExpiresAt = null;
        updatedAt = failedAt;
        validateConsistency();
        return true;
    }

    public boolean expireLease(
            PersonaGenerationClaimToken token,
            Instant observedAt,
            Instant retryAt
    ) {
        Objects.requireNonNull(observedAt, "observedAt");
        if (!ownsActiveClaim(token)
                || leaseExpiresAt == null
                || leaseExpiresAt.isAfter(observedAt)) {
            return false;
        }
        return fail(
                token,
                "PERSONA_PROCESSING_LEASE_EXPIRED",
                observedAt,
                retryAt);
    }

    public void scheduleManualRetry(Instant requestedAt) {
        Objects.requireNonNull(requestedAt, "requestedAt");
        if (status != PersonaGenerationStatus.FAILED
                || nextAttemptAt != null
                || claimToken != null
                || leaseExpiresAt != null) {
            throw invalidTransition(
                    "only terminal FAILED generation can be retried");
        }
        if (requestedAt.isBefore(updatedAt)) {
            throw PersonaDomainException.invariant(
                    "PERSONA_GENERATION_RETRY_TIME_INVALID",
                    "requestedAt",
                    "requestedAt must not be before updatedAt");
        }
        nextAttemptAt = requestedAt;
        updatedAt = requestedAt;
        validateConsistency();
    }

    public boolean ownsActiveClaim(PersonaGenerationClaimToken token) {
        return status == PersonaGenerationStatus.PROCESSING
                && token != null
                && token.equals(claimToken);
    }

    public boolean isDispatchableAt(Instant instant) {
        Objects.requireNonNull(instant, "instant");
        return (status == PersonaGenerationStatus.PENDING
                || status == PersonaGenerationStatus.FAILED)
                && nextAttemptAt != null
                && !nextAttemptAt.isAfter(instant);
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
                || nextAttemptAt == null || claimToken != null
                || leaseExpiresAt != null) {
            throw inconsistent("pending fields are inconsistent");
        }
    }

    private void validateProcessing() {
        if (attemptCount < 1 || personaId != null || lastErrorCode != null
                || processingStartedAt == null || completedAt != null
                || nextAttemptAt != null || claimToken == null
                || leaseExpiresAt == null
                || !leaseExpiresAt.isAfter(processingStartedAt)) {
            throw inconsistent("processing fields are inconsistent");
        }
    }

    private void validateSucceeded() {
        if (attemptCount < 1 || personaId == null || lastErrorCode != null
                || processingStartedAt == null || completedAt == null
                || completedAt.isBefore(processingStartedAt)
                || nextAttemptAt != null || claimToken != null
                || leaseExpiresAt != null) {
            throw inconsistent("succeeded fields are inconsistent");
        }
    }

    private void validateFailed() {
        if (attemptCount < 1 || personaId != null || lastErrorCode == null
                || processingStartedAt == null || completedAt != null
                || claimToken != null || leaseExpiresAt != null
                || (nextAttemptAt != null
                && nextAttemptAt.isBefore(updatedAt))) {
            throw inconsistent("failed fields are inconsistent");
        }
    }

    private void requireNotBeforeProcessing(Instant instant, String field) {
        Objects.requireNonNull(instant, field);
        if (processingStartedAt == null
                || instant.isBefore(processingStartedAt)) {
            throw PersonaDomainException.invariant(
                    "PERSONA_GENERATION_TIME_INVALID",
                    field,
                    field + " must not be before processingStartedAt");
        }
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw PersonaDomainException.invariant(
                    "PERSONA_GENERATION_TEXT_REQUIRED",
                    field,
                    field + " must not be blank");
        }
        String normalized = value.trim();
        if (!normalized.equals(value)) {
            throw PersonaDomainException.invariant(
                    "PERSONA_GENERATION_TEXT_INVALID",
                    field,
                    field + " must not contain surrounding whitespace");
        }
        return normalized;
    }

    private PersonaDomainException invalidTransition(String message) {
        return PersonaDomainException.invariant(
                "PERSONA_GENERATION_TRANSITION_NOT_ALLOWED",
                "status",
                message);
    }

    private static PersonaDomainException inconsistent(String message) {
        return PersonaDomainException.invariant(
                "PERSONA_GENERATION_STATE_INVALID",
                "status",
                message);
    }

    public PersonaGenerationId id() { return id; }
    public PersonaSourceType sourceType() { return sourceType; }
    public PersonaSourceId sourceId() { return sourceId; }
    public PersonaGenerationStatus status() { return status; }
    public int attemptCount() { return attemptCount; }
    public Optional<PersonaId> personaId() { return Optional.ofNullable(personaId); }
    public Optional<String> lastErrorCode() { return Optional.ofNullable(lastErrorCode); }
    public Instant createdAt() { return createdAt; }
    public Optional<Instant> processingStartedAt() { return Optional.ofNullable(processingStartedAt); }
    public Optional<Instant> completedAt() { return Optional.ofNullable(completedAt); }
    public Optional<Instant> nextAttemptAt() { return Optional.ofNullable(nextAttemptAt); }
    public Optional<PersonaGenerationClaimToken> claimToken() { return Optional.ofNullable(claimToken); }
    public Optional<Instant> leaseExpiresAt() { return Optional.ofNullable(leaseExpiresAt); }
    public Instant updatedAt() { return updatedAt; }
}
