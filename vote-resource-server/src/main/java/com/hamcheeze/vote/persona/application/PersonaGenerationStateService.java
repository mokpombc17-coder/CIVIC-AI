package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationAttemptRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaVersionRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.PersonaVersion;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaVersionId;
import com.hamcheeze.vote.persona.infra.PersonaGenerationProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

@Service
public class PersonaGenerationStateService {

    private final PersonaGenerationRepository generations;
    private final PersonaVersionRepository versions;
    private final PersonaGenerationAttemptRepository attempts;
    private final PersonaGenerationProperties properties;
    private final Clock clock;
    private final Supplier<UUID> tokenGenerator;

    @Autowired
    public PersonaGenerationStateService(
            PersonaGenerationRepository generations,
            PersonaVersionRepository versions,
            PersonaGenerationAttemptRepository attempts,
            PersonaGenerationProperties properties
    ) {
        this(generations, versions, attempts, properties,
                Clock.systemUTC(), UUID::randomUUID);
    }

    PersonaGenerationStateService(
            PersonaGenerationRepository generations,
            PersonaVersionRepository versions,
            PersonaGenerationAttemptRepository attempts,
            PersonaGenerationProperties properties,
            Clock clock,
            Supplier<UUID> tokenGenerator
    ) {
        this.generations = Objects.requireNonNull(
                generations, "generations");
        this.versions = Objects.requireNonNull(versions, "versions");
        this.attempts = Objects.requireNonNull(attempts, "attempts");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.tokenGenerator = Objects.requireNonNull(
                tokenGenerator, "tokenGenerator");
    }

    @Transactional
    public Optional<ClaimedPersonaGeneration> claimNext(String workerId) {
        Instant startedAt = clock.instant();
        Optional<PersonaGeneration> candidate =
                generations.findNextDispatchableForUpdate(startedAt);
        if (candidate.isEmpty()) {
            return Optional.empty();
        }
        PersonaGeneration generation = candidate.orElseThrow();
        PersonaGenerationClaimToken token =
                new PersonaGenerationClaimToken(tokenGenerator.get());
        Instant leaseExpiresAt = startedAt.plus(
                properties.getProcessingLeaseDuration());
        generation.claim(token, startedAt, leaseExpiresAt);
        generations.save(generation);
        attempts.insert(PersonaGenerationAttempt.processing(
                generation.id(), generation.attemptCount(), token,
                startedAt, leaseExpiresAt, workerId));
        return Optional.of(new ClaimedPersonaGeneration(
                generation,
                token,
                generation.attemptCount(),
                startedAt,
                leaseExpiresAt));
    }

    @Transactional
    public CompletionResult succeed(
            PersonaGenerationId generationId,
            PersonaGenerationClaimToken claimToken,
            PersonaGenerationInputSnapshot input,
            PersonaCreationResult result
    ) {
        Objects.requireNonNull(input, "input");
        Objects.requireNonNull(result, "result");
        PersonaGeneration generation = requireGenerationForUpdate(
                generationId);
        if (!generation.ownsActiveClaim(claimToken)) {
            observeLateCompletion(claimToken);
            return CompletionResult.IGNORED_STALE_CLAIM;
        }
        PersonaSourceId sourceId = input.sourceId();
        if (!generationId.equals(input.generationId())) {
            throw new IllegalArgumentException(
                    "input generation ID must match claim generation");
        }
        if (!generationId.equals(result.generationId())) {
            throw new IllegalArgumentException(
                    "result generation ID must match claim generation");
        }
        if (generation.sourceType() != PersonaSourceType.SURVEY_RESPONSE
                || !generation.sourceId().equals(sourceId)) {
            throw new IllegalArgumentException(
                    "survey source must match generation source");
        }
        Instant succeededAt = clock.instant();
        generation.succeed(claimToken, result.personaId(), succeededAt);
        generations.save(generation);
        versions.insert(new PersonaVersion(
                new PersonaVersionId(UUID.randomUUID()),
                generation.id(),
                input.userId(),
                result.personaId(),
                result.predictedAdoptionRate(),
                result.modelVersion(),
                succeededAt,
                PersonaSourceType.SURVEY_RESPONSE,
                sourceId));
        finishAttempt(
                claimToken,
                PersonaGenerationAttemptOutcome.SUCCEEDED,
                succeededAt,
                null);
        return CompletionResult.APPLIED;
    }

    @Transactional
    public FailureResult fail(
            PersonaGenerationId generationId,
            PersonaGenerationClaimToken claimToken,
            String errorCode,
            boolean retryable
    ) {
        PersonaGeneration generation = requireGenerationForUpdate(
                generationId);
        if (!generation.ownsActiveClaim(claimToken)) {
            observeLateCompletion(claimToken);
            return new FailureResult(
                    CompletionResult.IGNORED_STALE_CLAIM,
                    Optional.empty(),
                    false);
        }
        Instant failedAt = clock.instant();
        Instant retryAt = automaticRetryAt(
                generation.attemptCount(), retryable, failedAt);
        generation.fail(claimToken, errorCode, failedAt, retryAt);
        generations.save(generation);
        finishAttempt(
                claimToken,
                PersonaGenerationAttemptOutcome.FAILED,
                failedAt,
                errorCode);
        return new FailureResult(
                CompletionResult.APPLIED,
                Optional.ofNullable(retryAt),
                retryAt == null);
    }

    @Transactional
    public int reapExpired(int limit) {
        if (limit < 1) {
            throw new IllegalArgumentException("limit must be at least 1");
        }
        int reaped = 0;
        Instant observedAt = clock.instant();
        for (int index = 0; index < limit; index++) {
            Optional<PersonaGeneration> candidate =
                    generations.findNextExpiredLeaseForUpdate(observedAt);
            if (candidate.isEmpty()) {
                break;
            }
            PersonaGeneration generation = candidate.orElseThrow();
            PersonaGenerationClaimToken token = generation.claimToken()
                    .orElseThrow(() -> new IllegalStateException(
                            "processing generation has no claim token"));
            Instant retryAt = automaticRetryAt(
                    generation.attemptCount(), true, observedAt);
            if (!generation.expireLease(token, observedAt, retryAt)) {
                continue;
            }
            generations.save(generation);
            finishAttempt(
                    token,
                    PersonaGenerationAttemptOutcome.LEASE_EXPIRED,
                    observedAt,
                    "PERSONA_PROCESSING_LEASE_EXPIRED");
            reaped++;
        }
        return reaped;
    }

    private Instant automaticRetryAt(
            int attemptCount,
            boolean retryable,
            Instant failedAt
    ) {
        if (!retryable || attemptCount >= properties.getMaxAttempts()) {
            return null;
        }
        return failedAt.plus(retryDelay(attemptCount));
    }

    private Duration retryDelay(int attemptCount) {
        long multiplier = 1L << Math.min(
                Math.max(0, attemptCount - 1), 30);
        Duration calculated = properties.getRetryInitialDelay()
                .multipliedBy(multiplier);
        return calculated.compareTo(properties.getRetryMaxDelay()) > 0
                ? properties.getRetryMaxDelay() : calculated;
    }

    private PersonaGeneration requireGenerationForUpdate(
            PersonaGenerationId generationId
    ) {
        Objects.requireNonNull(generationId, "generationId");
        return generations.findByIdForUpdate(generationId)
                .orElseThrow(() -> new IllegalStateException(
                        "persona generation not found"));
    }

    private void finishAttempt(
            PersonaGenerationClaimToken token,
            PersonaGenerationAttemptOutcome outcome,
            Instant finishedAt,
            String errorCode
    ) {
        PersonaGenerationAttempt attempt = attempts.findByClaimToken(token)
                .orElseThrow(() -> new IllegalStateException(
                        "persona generation attempt not found"));
        attempts.update(attempt.finish(outcome, finishedAt, errorCode));
    }

    private void observeLateCompletion(PersonaGenerationClaimToken token) {
        attempts.findByClaimToken(token).ifPresent(attempt ->
                attempts.update(attempt.observeLateCompletion(
                        clock.instant())));
    }

    public enum CompletionResult {
        APPLIED,
        IGNORED_STALE_CLAIM
    }

    public record FailureResult(
            CompletionResult completion,
            Optional<Instant> nextAttemptAt,
            boolean terminal
    ) {
        public FailureResult {
            Objects.requireNonNull(completion, "completion");
            nextAttemptAt = Objects.requireNonNull(
                    nextAttemptAt, "nextAttemptAt");
        }
    }

    public record ClaimedPersonaGeneration(
            PersonaGeneration generation,
            PersonaGenerationClaimToken claimToken,
            int attemptNumber,
            Instant processingStartedAt,
            Instant leaseExpiresAt
    ) {
        public ClaimedPersonaGeneration {
            Objects.requireNonNull(generation, "generation");
            Objects.requireNonNull(claimToken, "claimToken");
            Objects.requireNonNull(processingStartedAt,
                    "processingStartedAt");
            Objects.requireNonNull(leaseExpiresAt, "leaseExpiresAt");
        }
    }
}
