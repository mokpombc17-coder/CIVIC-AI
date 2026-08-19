package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.application.port.in.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.application.port.out.PersonaCreationPort;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.infra.PersonaGenerationProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

@Component
@ConditionalOnProperty(
        prefix = "vote.persona",
        name = "enabled",
        havingValue = "true")
public class PersonaGenerationDispatcher {

    private static final Logger log = LoggerFactory.getLogger(
            PersonaGenerationDispatcher.class);

    private final PersonaGenerationStateService states;
    private final PersonaSurveySourceQueryPort sources;
    private final PersonaCreationPort personaCreation;
    private final PersonaGenerationProperties properties;
    private final Clock clock;

    @Autowired
    public PersonaGenerationDispatcher(
            PersonaGenerationStateService states,
            PersonaSurveySourceQueryPort sources,
            PersonaCreationPort personaCreation,
            PersonaGenerationProperties properties
    ) {
        this(states, sources, personaCreation, properties,
                Clock.systemUTC());
    }

    PersonaGenerationDispatcher(
            PersonaGenerationStateService states,
            PersonaSurveySourceQueryPort sources,
            PersonaCreationPort personaCreation,
            PersonaGenerationProperties properties,
            Clock clock
    ) {
        this.states = Objects.requireNonNull(states, "states");
        this.sources = Objects.requireNonNull(sources, "sources");
        this.personaCreation = Objects.requireNonNull(
                personaCreation, "personaCreation");
        this.properties = Objects.requireNonNull(
                properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Scheduled(fixedDelayString =
            "${vote.persona.dispatcher-delay:5s}")
    public void dispatchScheduled() {
        dispatchAvailable();
    }

    public int dispatchAvailable() {
        int dispatched = 0;
        for (int index = 0; index < properties.getBatchSize(); index++) {
            Optional<PersonaGeneration> claimed = states.claimNext();
            if (claimed.isEmpty()) {
                break;
            }
            dispatch(claimed.get());
            dispatched++;
        }
        return dispatched;
    }

    private void dispatch(PersonaGeneration generation) {
        try {
            PersonaSurveySource source = sources.getByResponseId(
                    generation.sourceResponseId());
            PersonaCreationResult result = personaCreation.create(
                    new PersonaCreationCommand(
                            generation.id(),
                            PersonaCreationCommand.CURRENT_SCHEMA_VERSION,
                            source));
            if (!generation.id().equals(result.generationId())) {
                throw new PersonaCreationException(
                        PersonaCreationErrorCode.GENERATION_ID_MISMATCH,
                        false,
                        "persona response generationId does not match");
            }
            states.succeed(generation.id(), source, result);
            log.info("Persona generation succeeded: generationId={}",
                    generation.id().value());
        } catch (PersonaSurveySourceException exception) {
            recordFailure(
                    generation,
                    PersonaCreationErrorCode.SOURCE_UNAVAILABLE,
                    false);
        } catch (PersonaCreationException exception) {
            recordFailure(
                    generation,
                    exception.errorCode(),
                    exception.retryable());
        } catch (PersonaGenerationPersistenceException exception) {
            recordFailure(
                    generation,
                    PersonaCreationErrorCode.PERSONA_ID_ALREADY_LINKED,
                    false);
        } catch (RuntimeException exception) {
            recordFailure(
                    generation,
                    PersonaCreationErrorCode.INTERNAL_ERROR,
                    true);
        }
    }

    private void recordFailure(
            PersonaGeneration generation,
            PersonaCreationErrorCode errorCode,
            boolean retryable
    ) {
        Instant retryAt = null;
        if (retryable
                && generation.attemptCount() < properties.getMaxAttempts()) {
            retryAt = clock.instant().plus(retryDelay(
                    generation.attemptCount()));
        }
        states.fail(generation.id(), errorCode.name(), retryAt);
        log.warn(
                "Persona generation failed: generationId={}, code={}, retryScheduled={}",
                generation.id().value(), errorCode, retryAt != null);
    }

    private Duration retryDelay(int attemptCount) {
        long multiplier = 1L << Math.min(
                Math.max(0, attemptCount - 1), 30);
        Duration calculated = properties.getRetryInitialDelay()
                .multipliedBy(multiplier);
        return calculated.compareTo(properties.getRetryMaxDelay()) > 0
                ? properties.getRetryMaxDelay()
                : calculated;
    }
}
