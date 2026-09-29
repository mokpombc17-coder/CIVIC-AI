package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRunRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapRevisionRepository;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class OpinionMapGenerationStateService {

    private final OpinionMapGenerationRepository generations;
    private final OpinionMapGenerationPolicy policy;
    private final OpinionMapGenerationRunRepository runs;
    private final OpinionMapRevisionRepository revisions;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public OpinionMapGenerationStateService(
            OpinionMapGenerationRepository generations,
            OpinionMapGenerationPolicy policy,
            ObjectMapper objectMapper,
            OpinionMapGenerationRunRepository runs,
            OpinionMapRevisionRepository revisions
    ) {
        this(generations, policy, objectMapper, runs, revisions,
                Clock.systemUTC());
    }

    OpinionMapGenerationStateService(
            OpinionMapGenerationRepository generations,
            OpinionMapGenerationPolicy policy,
            ObjectMapper objectMapper,
            OpinionMapGenerationRunRepository runs,
            OpinionMapRevisionRepository revisions,
            Clock clock
    ) {
        this.generations = Objects.requireNonNull(
                generations, "generations");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.runs = Objects.requireNonNull(runs, "runs");
        this.revisions = Objects.requireNonNull(revisions, "revisions");
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public boolean enqueue(TaskResultManifest manifest) {
        Objects.requireNonNull(manifest, "manifest");
        if (!policy.enabled()) {
            return false;
        }
        OpinionMapGeneration generation = OpinionMapGeneration.pending(
                new OpinionMapGenerationId(UUID.randomUUID()),
                manifest.taskId(),
                manifest.resultVersion(),
                manifest.bodySha256(),
                policy.promptVersion(),
                clock.instant());
        return generations.insertIfAbsent(generation);
    }

    @Transactional
    public OpinionMapGenerationRun enqueueManualRetryRun(
            OpinionMapGeneration generation,
            String requestedBy,
            Instant requestedAt
    ) {
        return runs.enqueueManualRetry(
                generation.id(), requestedBy, requestedAt);
    }

    @Transactional
    public Optional<OpinionMapGenerationRunClaim> claimNext() {
        if (!policy.enabled()) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        Optional<OpinionMapGeneration> found =
                generations.findNextDispatchableForUpdate(now);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        OpinionMapGeneration generation = found.orElseThrow();
        UUID claimId = UUID.randomUUID();
        if (!generation.claim(
                claimId,
                now,
                policy.processingLeaseDuration(),
                policy.maximumAttempts())) {
            generations.save(generation);
            return Optional.empty();
        }
        generations.save(generation);
        UUID runId = runs.startInitialAttempt(
                generation,
                claimId,
                generation.attemptCount(),
                now,
                policy.processingLeaseDuration());
        return Optional.of(new OpinionMapGenerationRunClaim(
                runId,
                generation.id(),
                OpinionMapGenerationRun.Trigger.TASK_CLOSED,
                claimId,
                generation.attemptCount(),
                generation.taskId(),
                generation.resultVersion(),
                generation.sourceBodySha256(),
                generation.promptVersion()));
    }

    @Transactional
    public boolean completeSuccess(
            OpinionMapGenerationRunClaim claim,
            OpinionMapGenerationGatewayResult result
    ) {
        Objects.requireNonNull(claim, "claim");
        Objects.requireNonNull(result, "result");
        OpinionMapGeneration generation = generations.findByIdForUpdate(
                        claim.generationId())
                .orElseThrow(() -> new IllegalStateException(
                        "claimed Opinion Map generation disappeared"));
        String outputJson;
        try {
            outputJson = objectMapper.writeValueAsString(result.output());
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "validated Opinion Map output could not be serialized",
                    exception);
        }
        Instant completedAt = clock.instant();
        if (!generation.succeed(
                claim.claimId(), outputJson, completedAt)) {
            return false;
        }
        generations.save(generation);
        runs.synchronizeInitial(claim.runId(), generation);
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
        Objects.requireNonNull(claim, "claim");
        OpinionMapGeneration generation = generations.findByIdForUpdate(
                        claim.generationId())
                .orElseThrow(() -> new IllegalStateException(
                        "claimed Opinion Map generation disappeared"));
        if (!generation.fail(
                claim.claimId(),
                errorCode,
                retryable,
                policy.maximumAttempts(),
                policy.retryDelay(),
                clock.instant())) {
            return false;
        }
        generations.save(generation);
        runs.synchronizeInitial(claim.runId(), generation);
        return true;
    }
}
