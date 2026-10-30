package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.application.PersonaGenerationRetryException.ErrorCode;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRetryRequestRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaGenerationStatus;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.infra.PersonaGenerationMetrics;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;

@Service
public class PersonaGenerationRetryService {

    private final PersonaGenerationRepository generations;
    private final PersonaGenerationRetryRequestRepository retries;
    private final Clock clock;
    private final Supplier<UUID> idGenerator;
    private final PersonaGenerationMetrics metrics;

    @Autowired
    public PersonaGenerationRetryService(
            PersonaGenerationRepository generations,
            PersonaGenerationRetryRequestRepository retries,
            PersonaGenerationMetrics metrics
    ) {
        this(generations, retries, metrics,
                Clock.systemUTC(), UUID::randomUUID);
    }

    PersonaGenerationRetryService(
            PersonaGenerationRepository generations,
            PersonaGenerationRetryRequestRepository retries,
            PersonaGenerationMetrics metrics,
            Clock clock,
            Supplier<UUID> idGenerator
    ) {
        this.generations = Objects.requireNonNull(
                generations, "generations");
        this.retries = Objects.requireNonNull(retries, "retries");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.idGenerator = Objects.requireNonNull(idGenerator, "idGenerator");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
    }

    @Transactional
    public RetryExecution retry(RetryCommand command) {
        Objects.requireNonNull(command, "command");
        PersonaGeneration generation = generations.findByIdForUpdate(
                        command.generationId())
                .orElseThrow(() -> failure(
                        ErrorCode.PERSONA_GENERATION_NOT_FOUND,
                        "Persona generation does not exist"));
        String fingerprint = fingerprint(
                command.generationId(), command.reason());
        var existing = retries.findByGenerationAndKey(
                command.generationId(), command.idempotencyKey());
        if (existing.isPresent()) {
            PersonaGenerationRetryRequest request = existing.orElseThrow();
            if (!request.requestFingerprint().equals(fingerprint)) {
                throw failure(
                        ErrorCode.PERSONA_GENERATION_RETRY_IDEMPOTENCY_CONFLICT,
                        "Idempotency-Key was already used for a different retry request");
            }
            afterCommit(metrics::manualRetryIdempotent);
            return new RetryExecution(request, false);
        }
        requireTerminalFailure(generation);
        Instant requestedAt = clock.instant();
        PersonaGenerationRetryRequest request =
                new PersonaGenerationRetryRequest(
                        idGenerator.get(),
                        generation.id(),
                        command.idempotencyKey(),
                        generation.attemptCount(),
                        command.requestedBy(),
                        requestedAt,
                        command.reason(),
                        fingerprint);
        generation.scheduleManualRetry(requestedAt);
        generations.save(generation);
        retries.insert(request);
        afterCommit(metrics::manualRetryScheduled);
        return new RetryExecution(request, true);
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager
                .isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            action.run();
                        }
                    });
            return;
        }
        action.run();
    }

    private static void requireTerminalFailure(
            PersonaGeneration generation
    ) {
        if (generation.status() != PersonaGenerationStatus.FAILED
                || generation.nextAttemptAt().isPresent()
                || generation.claimToken().isPresent()) {
            throw failure(
                    ErrorCode.PERSONA_GENERATION_TERMINAL_FAILURE_REQUIRED,
                    "Only terminal FAILED Persona generation can be retried; currentStatus="
                            + generation.status()
                            + ", retryScheduled="
                            + generation.nextAttemptAt().isPresent());
        }
    }

    private static String fingerprint(
            PersonaGenerationId generationId,
            String reason
    ) {
        String normalizedReason = requireText(
                reason,
                PersonaGenerationRetryRequest.MAX_REASON_LENGTH,
                "reason");
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(
                    (generationId.value() + "\n" + normalizedReason)
                            .getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static String requireText(
            String value,
            int maxLength,
            String field
    ) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(field + " is too long");
        }
        return normalized;
    }

    private static PersonaGenerationRetryException failure(
            ErrorCode code,
            String message
    ) {
        return new PersonaGenerationRetryException(code, message);
    }

    public record RetryCommand(
            PersonaGenerationId generationId,
            String idempotencyKey,
            String requestedBy,
            String reason
    ) {
        public RetryCommand {
            Objects.requireNonNull(generationId, "generationId");
            idempotencyKey = requireText(
                    idempotencyKey,
                    PersonaGenerationRetryRequest.MAX_IDEMPOTENCY_KEY_LENGTH,
                    "idempotencyKey");
            requestedBy = requireText(requestedBy, 255, "requestedBy");
            reason = requireText(
                    reason,
                    PersonaGenerationRetryRequest.MAX_REASON_LENGTH,
                    "reason");
        }
    }

    public record RetryExecution(
            PersonaGenerationRetryRequest request,
            boolean created
    ) {
        public RetryExecution {
            Objects.requireNonNull(request, "request");
        }
    }
}
