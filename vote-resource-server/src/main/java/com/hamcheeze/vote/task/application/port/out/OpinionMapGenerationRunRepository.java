package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRun;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRunClaim;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface OpinionMapGenerationRunRepository {

    UUID startInitialAttempt(
            OpinionMapGeneration generation,
            UUID claimId,
            int attemptNumber,
            Instant startedAt,
            Duration leaseDuration);

    OpinionMapGenerationRun enqueueManualRetry(
            OpinionMapGenerationId generationId,
            String requestedBy,
            Instant requestedAt);

    OpinionMapGenerationRun enqueueRegeneration(
            OpinionMapGenerationId generationId,
            String requestedBy,
            String idempotencyKey,
            Instant requestedAt);

    Optional<OpinionMapGenerationRun> findActiveRegeneration(
            OpinionMapGenerationId generationId);

    Optional<OpinionMapGenerationRun> findRegenerationByIdempotencyKey(
            OpinionMapGenerationId generationId,
            String idempotencyKey);

    Optional<OpinionMapGenerationRunClaim> claimNextRegeneration(
            Instant now,
            Duration leaseDuration,
            int maximumAttempts);

    boolean completeSuccess(UUID runId, UUID claimId, Instant completedAt);

    boolean completeFailure(
            UUID runId,
            UUID claimId,
            String errorCode,
            boolean retryable,
            int maximumAttempts,
            Duration retryDelay,
            Instant completedAt);

    void synchronizeInitial(
            UUID runId,
            OpinionMapGeneration generation);
}
