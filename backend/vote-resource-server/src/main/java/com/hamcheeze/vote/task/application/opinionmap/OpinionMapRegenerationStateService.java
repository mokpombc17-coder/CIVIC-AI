package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRunRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapRevisionRepository;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

@Service
public class OpinionMapRegenerationStateService {

    private final OpinionMapGenerationRepository generations;
    private final OpinionMapGenerationRunRepository runs;
    private final OpinionMapRevisionRepository revisions;
    private final OpinionMapGenerationPolicy policy;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public OpinionMapRegenerationStateService(
            OpinionMapGenerationRepository generations,
            OpinionMapGenerationRunRepository runs,
            OpinionMapRevisionRepository revisions,
            OpinionMapGenerationPolicy policy,
            ObjectMapper objectMapper
    ) {
        this(generations, runs, revisions, policy, objectMapper,
                Clock.systemUTC());
    }

    OpinionMapRegenerationStateService(
            OpinionMapGenerationRepository generations,
            OpinionMapGenerationRunRepository runs,
            OpinionMapRevisionRepository revisions,
            OpinionMapGenerationPolicy policy,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this.generations = Objects.requireNonNull(
                generations, "generations");
        this.runs = Objects.requireNonNull(runs, "runs");
        this.revisions = Objects.requireNonNull(revisions, "revisions");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public Request enqueue(
            OpinionMapGeneration generation,
            String requestedBy,
            String idempotencyKey
    ) {
        if (generation.status()
                != com.hamcheeze.vote.task.domain.opinionmap
                .OpinionMapGenerationStatus.AVAILABLE) {
            throw new IllegalStateException(
                    "only an available Opinion Map can be regenerated");
        }
        Optional<OpinionMapGenerationRun> duplicate =
                runs.findRegenerationByIdempotencyKey(
                        generation.id(), idempotencyKey);
        if (duplicate.isPresent()) {
            return new Request(duplicate.orElseThrow(), false);
        }
        Optional<OpinionMapGenerationRun> active =
                runs.findActiveRegeneration(generation.id());
        if (active.isPresent()) {
            return new Request(active.orElseThrow(), false);
        }
        return new Request(runs.enqueueRegeneration(
                generation.id(), requestedBy, idempotencyKey,
                clock.instant()), true);
    }

    @Transactional
    public Optional<OpinionMapGenerationRunClaim> claimNext() {
        if (!policy.enabled()) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        runs.expireExhaustedRegenerations(
                now, policy.maximumAttempts());
        return runs.claimNextRegeneration(
                now,
                policy.processingLeaseDuration(),
                policy.maximumAttempts());
    }

    @Transactional
    public boolean completeSuccess(
            OpinionMapGenerationRunClaim claim,
            OpinionMapGenerationGatewayResult result
    ) {
        Objects.requireNonNull(claim, "claim");
        Objects.requireNonNull(result, "result");
        Instant completedAt = clock.instant();
        if (!runs.completeSuccess(
                claim.runId(), claim.claimId(), completedAt)) {
            return false;
        }
        OpinionMapGeneration generation = generations.findByIdForUpdate(
                        claim.generationId())
                .orElseThrow(() -> new IllegalStateException(
                        "Opinion Map generation disappeared"));
        String outputJson;
        try {
            outputJson = objectMapper.writeValueAsString(result.output());
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "validated Opinion Map output could not be serialized",
                    exception);
        }
        generation.replaceAvailableOutput(outputJson, completedAt);
        generation = generations.save(generation);
        revisions.insertAiRevision(
                generation, claim.runId(), outputJson, result, completedAt);
        return true;
    }

    @Transactional
    public boolean completeFailure(
            OpinionMapGenerationRunClaim claim,
            String errorCode,
            boolean retryable
    ) {
        return runs.completeFailure(
                claim.runId(),
                claim.claimId(),
                errorCode,
                retryable,
                policy.maximumAttempts(),
                policy.retryDelay(),
                clock.instant());
    }

    public record Request(
            OpinionMapGenerationRun run,
            boolean created
    ) {
        public Request {
            Objects.requireNonNull(run, "run");
        }
    }
}
