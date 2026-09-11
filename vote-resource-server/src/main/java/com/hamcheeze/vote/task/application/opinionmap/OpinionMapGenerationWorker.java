package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationStateService.OpinionMapGenerationClaim;
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

    public OpinionMapGenerationWorker(
            OpinionMapGenerationStateService states,
            TaskResultViewVerificationService verification,
            TaskResultForLlmV1Assembler assembler,
            TaskResultForLlmRenderer renderer,
            OpinionMapPromptProvider prompts,
            OpinionMapGenerationGateway gateway,
            OpinionMapGenerationPolicy policy
    ) {
        this.states = Objects.requireNonNull(states, "states");
        this.verification = Objects.requireNonNull(
                verification, "verification");
        this.assembler = Objects.requireNonNull(assembler, "assembler");
        this.renderer = Objects.requireNonNull(renderer, "renderer");
        this.prompts = Objects.requireNonNull(prompts, "prompts");
        this.gateway = Objects.requireNonNull(gateway, "gateway");
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    public boolean executeOne() {
        Optional<OpinionMapGenerationClaim> claimed = states.claimNext();
        if (claimed.isEmpty()) {
            return false;
        }
        execute(claimed.orElseThrow());
        return true;
    }

    void execute(OpinionMapGenerationClaim claim) {
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
            OpinionMapOptionExplanationV1 result = gateway.generate(
                    new OpinionMapGenerationRequest(
                            claim.generationId().value(),
                            input,
                            rendered.content(),
                            prompts.loadPrompt(),
                            claim.promptVersion(),
                            policy.requestTimeout()));
            if (result.status()
                    != OpinionMapOptionExplanationV1.GenerationStatus.COMPLETED) {
                throw new OpinionMapGenerationException(
                        "OPINION_MAP_RESPONSE_INVALID",
                        false,
                        "generation gateway did not return a completed result");
            }
            result.validateAgainst(input);
            states.completeSuccess(claim, result);
        } catch (OpinionMapGenerationException exception) {
            states.completeFailure(
                    claim, exception.errorCode(), exception.retryable());
            log.warn(
                    "Opinion Map generation failed: generationId={}, attempt={}, code={}, retryable={}",
                    claim.generationId().value(), claim.attemptNumber(),
                    exception.errorCode(), exception.retryable());
        } catch (IllegalArgumentException exception) {
            states.completeFailure(
                    claim, "OPINION_MAP_RESPONSE_INVALID", true);
            log.warn(
                    "Opinion Map response validation failed: generationId={}, attempt={}",
                    claim.generationId().value(), claim.attemptNumber());
        } catch (RuntimeException exception) {
            states.completeFailure(
                    claim, "OPINION_MAP_GENERATION_INTERNAL_ERROR", true);
            log.warn(
                    "Opinion Map generation failed unexpectedly: generationId={}, attempt={}",
                    claim.generationId().value(), claim.attemptNumber());
        }
    }

    private static void verifyManifest(
            OpinionMapGenerationClaim claim,
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
