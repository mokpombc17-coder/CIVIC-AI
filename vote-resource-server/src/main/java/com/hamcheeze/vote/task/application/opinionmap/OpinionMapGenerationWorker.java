package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationGateway;
import com.hamcheeze.vote.task.application.port.out.OpinionMapPromptProvider;
import com.hamcheeze.vote.task.application.port.out.TaskResultForLlmRenderer;
import com.hamcheeze.vote.task.application.port.out.TaskResultForLlmRenderer.RenderedTaskResultForLlm;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1Assembler;
import com.hamcheeze.vote.task.application.result.TaskResultViewVerificationService;
import com.hamcheeze.vote.task.application.result.VerifiedTaskResultView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.Optional;

@Component
@ConditionalOnProperty(
        prefix = "vote.task.opinion-map",
        name = "enabled",
        havingValue = "true")
public class OpinionMapGenerationWorker {

    private static final Logger log = LoggerFactory.getLogger(
            OpinionMapGenerationWorker.class);

    private final OpinionMapGenerationStateService states;
    private final TaskResultViewVerificationService verification;
    private final TaskResultForLlmV1Assembler assembler;
    private final TaskResultForLlmRenderer renderer;
    private final OpinionMapPromptProvider prompts;
    private final OpinionMapGenerationGateway gateway;
    private final OpinionMapGenerationPolicy policy;
    private final OpinionMapRegenerationStateService regenerations;
    private final OpinionMapGenerationAttemptService attempts;

    public OpinionMapGenerationWorker(
            OpinionMapGenerationStateService states,
            TaskResultViewVerificationService verification,
            TaskResultForLlmV1Assembler assembler,
            TaskResultForLlmRenderer renderer,
            OpinionMapPromptProvider prompts,
            OpinionMapGenerationGateway gateway,
            OpinionMapGenerationPolicy policy,
            OpinionMapRegenerationStateService regenerations,
            OpinionMapGenerationAttemptService attempts
    ) {
        this.states = Objects.requireNonNull(states, "states");
        this.verification = Objects.requireNonNull(
                verification, "verification");
        this.assembler = Objects.requireNonNull(assembler, "assembler");
        this.renderer = Objects.requireNonNull(renderer, "renderer");
        this.prompts = Objects.requireNonNull(prompts, "prompts");
        this.gateway = Objects.requireNonNull(gateway, "gateway");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.regenerations = Objects.requireNonNull(
                regenerations, "regenerations");
        this.attempts = Objects.requireNonNull(attempts, "attempts");
    }

    public boolean executeOne() {
        Optional<OpinionMapGenerationRunClaim> claimed =
                regenerations.claimNext().or(states::claimNext);
        if (claimed.isEmpty()) {
            return false;
        }
        execute(claimed.orElseThrow());
        return true;
    }

    void execute(OpinionMapGenerationRunClaim claim) {
        OpinionMapGenerationAttempt attempt = attempts.start(
                claim.runId(), claim.attemptNumber(), gateway.provider());
        boolean providerSucceeded = false;
        try {
            VerifiedTaskResultView verified = verification
                    .findByTaskId(claim.taskId())
                    .orElseThrow(() -> new OpinionMapGenerationException(
                            "OPINION_MAP_INPUT_UNAVAILABLE",
                            true,
                            "finalized Task result is unavailable"));
            verifyManifest(claim, verified);
            TaskResultForLlmV1 input = assembler.assemble(
                    claim.taskId(), verified);
            RenderedTaskResultForLlm rendered = renderer.render(input);
            OpinionMapGenerationGatewayResult generated =
                    gateway.generateWithMetadata(
                    new OpinionMapGenerationRequest(
                            claim.generationId().value(),
                            input,
                            rendered.content(),
                            prompts.loadPrompt(),
                            claim.promptVersion(),
                            policy.requestTimeout()));
            attempts.succeed(attempt, generated);
            providerSucceeded = true;
            OpinionMapOptionExplanationV1 result = generated.output();
            if (result.status()
                    != OpinionMapOptionExplanationV1.GenerationStatus.COMPLETED) {
                throw new OpinionMapGenerationException(
                        "OPINION_MAP_RESPONSE_INVALID",
                        false,
                        "generation gateway did not return a completed result");
            }
            result.validateAgainst(input);
            completeSuccess(claim, generated);
        } catch (OpinionMapGenerationException exception) {
            if (!providerSucceeded) {
                attempts.fail(attempt, exception);
            }
            completeFailure(
                    claim, exception.errorCode(), exception.retryable());
            log.warn(
                    "Opinion Map generation failed: generationId={}, attempt={}, code={}, retryable={}",
                    claim.generationId().value(), claim.attemptNumber(),
                    exception.errorCode(), exception.retryable());
        } catch (IllegalArgumentException exception) {
            OpinionMapGenerationException failure =
                    new OpinionMapGenerationException(
                            "OPINION_MAP_RESPONSE_INVALID",
                            true,
                            "Opinion Map response validation failed",
                            exception);
            if (!providerSucceeded) {
                attempts.fail(attempt, failure);
            }
            completeFailure(claim, failure.errorCode(), failure.retryable());
            log.warn(
                    "Opinion Map response validation failed: generationId={}, attempt={}",
                    claim.generationId().value(), claim.attemptNumber());
        } catch (RuntimeException exception) {
            OpinionMapGenerationException failure =
                    new OpinionMapGenerationException(
                            "OPINION_MAP_GENERATION_INTERNAL_ERROR",
                            true,
                            "Opinion Map generation failed unexpectedly",
                            exception);
            if (!providerSucceeded) {
                attempts.fail(attempt, failure);
            }
            completeFailure(claim, failure.errorCode(), failure.retryable());
            log.warn(
                    "Opinion Map generation failed unexpectedly: generationId={}, attempt={}",
                    claim.generationId().value(), claim.attemptNumber());
        }
    }

    private void completeSuccess(
            OpinionMapGenerationRunClaim claim,
            OpinionMapGenerationGatewayResult result
    ) {
        if (claim.trigger()
                == OpinionMapGenerationRun.Trigger.ADMIN_REGENERATE) {
            regenerations.completeSuccess(claim, result);
        } else {
            states.completeSuccess(claim, result);
        }
    }

    private void completeFailure(
            OpinionMapGenerationRunClaim claim,
            String errorCode,
            boolean retryable
    ) {
        if (claim.trigger()
                == OpinionMapGenerationRun.Trigger.ADMIN_REGENERATE) {
            regenerations.completeFailure(claim, errorCode, retryable);
        } else {
            states.completeFailure(claim, errorCode, retryable);
        }
    }

    private static void verifyManifest(
            OpinionMapGenerationRunClaim claim,
            VerifiedTaskResultView verified
    ) {
        if (verified.manifest().resultVersion() != claim.resultVersion()
                || !verified.manifest().bodySha256().equals(
                claim.sourceBodySha256())) {
            throw new OpinionMapGenerationException(
                    "OPINION_MAP_INPUT_CHANGED",
                    false,
                    "finalized Task result does not match the generation");
        }
    }
}
