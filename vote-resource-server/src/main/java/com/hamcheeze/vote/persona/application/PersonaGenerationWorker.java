package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.application.PersonaGenerationStateService.ClaimedPersonaGeneration;
import com.hamcheeze.vote.persona.application.PersonaGenerationStateService.CompletionResult;
import com.hamcheeze.vote.persona.application.PersonaGenerationStateService.FailureResult;
import com.hamcheeze.vote.persona.application.port.out.PersonaCreationPort;
import com.hamcheeze.vote.persona.application.port.out.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.infra.PersonaGenerationMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.Optional;

@Component
@ConditionalOnProperty(prefix = "vote.persona", name = "enabled", havingValue = "true")
public class PersonaGenerationWorker {

    private static final Logger log = LoggerFactory.getLogger(
            PersonaGenerationWorker.class);

    private final PersonaGenerationStateService states;
    private final PersonaSurveySourceQueryPort sources;
    private final ObjectProvider<PersonaCreationPort> personaCreation;
    private final PersonaGenerationMetrics metrics;
    private final String instanceId;

    public PersonaGenerationWorker(
            PersonaGenerationStateService states,
            PersonaSurveySourceQueryPort sources,
            ObjectProvider<PersonaCreationPort> personaCreation,
            PersonaGenerationMetrics metrics,
            @Value("${HOSTNAME:unknown-instance}") String instanceId
    ) {
        this.states = Objects.requireNonNull(states, "states");
        this.sources = Objects.requireNonNull(sources, "sources");
        this.personaCreation = Objects.requireNonNull(
                personaCreation, "personaCreation");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
        this.instanceId = requireText(instanceId, "instanceId");
    }

    public boolean executeOne() {
        PersonaCreationPort creation = personaCreation.getIfAvailable();
        if (creation == null) {
            throw new IllegalStateException(
                    "vote.persona.enabled=true requires a configured "
                            + "PersonaCreationPort; check vote.persona.provider");
        }
        Optional<ClaimedPersonaGeneration> claimed = states.claimNext(
                workerId());
        if (claimed.isEmpty()) {
            return false;
        }
        metrics.claimSucceeded();
        execute(claimed.orElseThrow(), creation);
        return true;
    }

    private void execute(
            ClaimedPersonaGeneration claim,
            PersonaCreationPort creation
    ) {
        PersonaGeneration generation = claim.generation();
        String tokenHint = claim.claimToken().value().toString()
                .substring(0, 8);
        try {
            PersonaSurveySource source = sources.getByResponseId(
                    generation.sourceId());
            PersonaCreationResult result = creation.create(
                    new PersonaCreationCommand(
                            generation.id(),
                            PersonaCreationCommand.CURRENT_SCHEMA_VERSION,
                            source));
            CompletionResult completion = states.succeed(
                    generation.id(), claim.claimToken(), source, result);
            logCompletion(generation, claim, tokenHint, completion, null);
        } catch (PersonaSurveySourceException exception) {
            recordFailure(claim, PersonaCreationErrorCode.SOURCE_UNAVAILABLE,
                    false, tokenHint);
        } catch (PersonaCreationException exception) {
            recordFailure(claim, exception.errorCode(),
                    exception.retryable(), tokenHint);
        } catch (PersonaGenerationPersistenceException exception) {
            recordFailure(claim,
                    PersonaCreationErrorCode.PERSONA_ID_ALREADY_LINKED,
                    false, tokenHint);
        } catch (RuntimeException exception) {
            recordFailure(claim, PersonaCreationErrorCode.INTERNAL_ERROR,
                    true, tokenHint);
        }
    }

    private void recordFailure(
            ClaimedPersonaGeneration claim,
            PersonaCreationErrorCode errorCode,
            boolean retryable,
            String tokenHint
    ) {
        FailureResult result = states.fail(
                claim.generation().id(), claim.claimToken(),
                errorCode.name(), retryable);
        logCompletion(claim.generation(), claim, tokenHint,
                result.completion(), errorCode);
        if (result.completion() == CompletionResult.APPLIED) {
            if (result.nextAttemptAt().isPresent()) {
                metrics.retryableFailure();
            } else {
                metrics.terminalFailure();
            }
            log.warn(
                    "Persona generation failed: generationId={}, attemptNumber={}, claimTokenHint={}, errorCode={}, retryScheduled={}, terminal={}",
                    claim.generation().id().value(), claim.attemptNumber(),
                    tokenHint, errorCode, result.nextAttemptAt().isPresent(),
                    result.terminal());
        }
    }

    private void logCompletion(
            PersonaGeneration generation,
            ClaimedPersonaGeneration claim,
            String tokenHint,
            CompletionResult completion,
            PersonaCreationErrorCode errorCode
    ) {
        if (completion == CompletionResult.IGNORED_STALE_CLAIM) {
            metrics.staleCompletionIgnored();
            log.info(
                    "Persona completion ignored: generationId={}, attemptNumber={}, claimTokenHint={}, errorCode={}, completionApplied=false",
                    generation.id().value(), claim.attemptNumber(),
                    tokenHint, errorCode);
        } else if (errorCode == null) {
            metrics.generationSucceeded();
            log.info(
                    "Persona generation succeeded: generationId={}, attemptNumber={}, claimTokenHint={}, completionApplied=true",
                    generation.id().value(), claim.attemptNumber(),
                    tokenHint);
        }
    }

    private String workerId() {
        String value = instanceId + ":" + Thread.currentThread().getName();
        return value.length() <= 255 ? value : value.substring(0, 255);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value.trim();
    }
}
