package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
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
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public OpinionMapGenerationStateService(
            OpinionMapGenerationRepository generations,
            OpinionMapGenerationPolicy policy,
            ObjectMapper objectMapper
    ) {
        this(generations, policy, objectMapper, Clock.systemUTC());
    }

    OpinionMapGenerationStateService(
            OpinionMapGenerationRepository generations,
            OpinionMapGenerationPolicy policy,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this.generations = Objects.requireNonNull(
                generations, "generations");
        this.policy = Objects.requireNonNull(policy, "policy");
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
    public Optional<OpinionMapGenerationClaim> claimNext() {
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
        return Optional.of(new OpinionMapGenerationClaim(
                generation.id(),
                claimId,
                generation.attemptCount(),
                generation.taskId(),
                generation.resultVersion(),
                generation.sourceBodySha256(),
                generation.promptVersion()));
    }

    @Transactional
    public boolean completeSuccess(
            OpinionMapGenerationClaim claim,
            OpinionMapOptionExplanationV1 result
    ) {
        Objects.requireNonNull(claim, "claim");
        Objects.requireNonNull(result, "result");
        OpinionMapGeneration generation = generations.findByIdForUpdate(
                        claim.generationId())
                .orElseThrow(() -> new IllegalStateException(
                        "claimed Opinion Map generation disappeared"));
        String outputJson;
        try {
            outputJson = objectMapper.writeValueAsString(result);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "validated Opinion Map output could not be serialized",
                    exception);
        }
        if (!generation.succeed(
                claim.claimId(), outputJson, clock.instant())) {
            return false;
        }
        generations.save(generation);
        return true;
    }

    @Transactional
    public boolean completeFailure(
            OpinionMapGenerationClaim claim,
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
        return true;
    }

    public record OpinionMapGenerationClaim(
            OpinionMapGenerationId generationId,
            UUID claimId,
            int attemptNumber,
            com.hamcheeze.vote.task.domain.common.TaskId taskId,
            int resultVersion,
            String sourceBodySha256,
            String promptVersion
    ) {
        public OpinionMapGenerationClaim {
            Objects.requireNonNull(generationId, "generationId");
            Objects.requireNonNull(claimId, "claimId");
            Objects.requireNonNull(taskId, "taskId");
        }
    }
}
