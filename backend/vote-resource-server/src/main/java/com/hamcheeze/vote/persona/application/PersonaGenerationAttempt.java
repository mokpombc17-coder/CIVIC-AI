package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public record PersonaGenerationAttempt(
        PersonaGenerationId generationId,
        int attemptNumber,
        PersonaGenerationClaimToken claimToken,
        Instant startedAt,
        Instant leaseExpiresAt,
        PersonaGenerationAttemptOutcome outcome,
        Optional<Instant> finishedAt,
        Optional<String> errorCode,
        Optional<Instant> lateCompletionObservedAt,
        String workerId
) {

    public PersonaGenerationAttempt {
        Objects.requireNonNull(generationId, "generationId");
        Objects.requireNonNull(claimToken, "claimToken");
        Objects.requireNonNull(startedAt, "startedAt");
        Objects.requireNonNull(leaseExpiresAt, "leaseExpiresAt");
        Objects.requireNonNull(outcome, "outcome");
        finishedAt = Objects.requireNonNull(finishedAt, "finishedAt");
        errorCode = Objects.requireNonNull(errorCode, "errorCode");
        lateCompletionObservedAt = Objects.requireNonNull(
                lateCompletionObservedAt, "lateCompletionObservedAt");
        workerId = requireText(workerId, "workerId");
        if (attemptNumber < 1) {
            throw new IllegalArgumentException(
                    "attemptNumber must be at least 1");
        }
        if (!leaseExpiresAt.isAfter(startedAt)) {
            throw new IllegalArgumentException(
                    "leaseExpiresAt must be after startedAt");
        }
        validateOutcome(outcome, finishedAt, errorCode);
    }

    public static PersonaGenerationAttempt processing(
            PersonaGenerationId generationId,
            int attemptNumber,
            PersonaGenerationClaimToken claimToken,
            Instant startedAt,
            Instant leaseExpiresAt,
            String workerId
    ) {
        return new PersonaGenerationAttempt(
                generationId, attemptNumber, claimToken, startedAt,
                leaseExpiresAt, PersonaGenerationAttemptOutcome.PROCESSING,
                Optional.empty(), Optional.empty(), Optional.empty(),
                workerId);
    }

    public PersonaGenerationAttempt finish(
            PersonaGenerationAttemptOutcome finishedOutcome,
            Instant finished,
            String failureCode
    ) {
        Objects.requireNonNull(finished, "finished");
        if (outcome != PersonaGenerationAttemptOutcome.PROCESSING) {
            throw new IllegalStateException("attempt is already finished");
        }
        return new PersonaGenerationAttempt(
                generationId, attemptNumber, claimToken, startedAt,
                leaseExpiresAt, finishedOutcome, Optional.of(finished),
                Optional.ofNullable(failureCode),
                lateCompletionObservedAt, workerId);
    }

    public PersonaGenerationAttempt observeLateCompletion(Instant observedAt) {
        Objects.requireNonNull(observedAt, "observedAt");
        if (observedAt.isBefore(startedAt)) {
            throw new IllegalArgumentException(
                    "late completion cannot precede attempt start");
        }
        if (lateCompletionObservedAt.isPresent()) {
            return this;
        }
        return new PersonaGenerationAttempt(
                generationId, attemptNumber, claimToken, startedAt,
                leaseExpiresAt, outcome, finishedAt, errorCode,
                Optional.of(observedAt), workerId);
    }

    private static void validateOutcome(
            PersonaGenerationAttemptOutcome outcome,
            Optional<Instant> finishedAt,
            Optional<String> errorCode
    ) {
        if (outcome == PersonaGenerationAttemptOutcome.PROCESSING) {
            if (finishedAt.isPresent() || errorCode.isPresent()) {
                throw new IllegalArgumentException(
                        "processing attempt cannot be finished");
            }
            return;
        }
        if (finishedAt.isEmpty()) {
            throw new IllegalArgumentException(
                    "finished attempt requires finishedAt");
        }
        if (outcome == PersonaGenerationAttemptOutcome.SUCCEEDED) {
            if (errorCode.isPresent()) {
                throw new IllegalArgumentException(
                        "succeeded attempt cannot have errorCode");
            }
            return;
        }
        if (errorCode.isEmpty()) {
            throw new IllegalArgumentException(
                    "failed attempt requires errorCode");
        }
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank() || !value.equals(value.trim())) {
            throw new IllegalArgumentException(
                    field + " must be trimmed and non-blank");
        }
        return value;
    }
}
