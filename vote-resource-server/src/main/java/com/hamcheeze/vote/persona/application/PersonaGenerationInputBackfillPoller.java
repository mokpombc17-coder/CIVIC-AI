package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.application.PersonaGenerationInputBackfillService.BackfillException;
import com.hamcheeze.vote.persona.infra.PersonaGenerationMetrics;
import com.hamcheeze.vote.persona.infra.PersonaGenerationProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
@ConditionalOnProperty(
        prefix = "vote.persona",
        name = "enabled",
        havingValue = "true")
public class PersonaGenerationInputBackfillPoller {

    private static final Logger log = LoggerFactory.getLogger(
            PersonaGenerationInputBackfillPoller.class);

    private final PersonaGenerationInputBackfillService backfill;
    private final PersonaGenerationProperties properties;
    private final PersonaGenerationMetrics metrics;

    public PersonaGenerationInputBackfillPoller(
            PersonaGenerationInputBackfillService backfill,
            PersonaGenerationProperties properties,
            PersonaGenerationMetrics metrics
    ) {
        this.backfill = Objects.requireNonNull(backfill, "backfill");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
    }

    @Scheduled(
            fixedDelayString = "${vote.persona.input-backfill-delay:30s}",
            initialDelayString = "${vote.persona.input-backfill-initial-delay:0s}",
            scheduler = "personaGenerationScheduler")
    public void backfillScheduled() {
        for (int index = 0; index < properties.getBatchSize(); index++) {
            try {
                var result = backfill.backfillNext();
                if (result.isEmpty()) {
                    return;
                }
                if (result.orElseThrow().created()) {
                    metrics.inputBackfillSucceeded();
                }
            } catch (BackfillException exception) {
                metrics.inputBackfillFailed();
                var generation = exception.generation();
                log.error(
                        "Persona generation input backfill failed: generationId={}, sourceId={}, errorCode=PERSONA_GENERATION_INPUT_UNAVAILABLE",
                        generation.id().value(),
                        generation.sourceId().value(),
                        exception);
                return;
            } catch (RuntimeException exception) {
                metrics.inputBackfillFailed();
                log.error(
                        "Persona generation input backfill failed unexpectedly; next polling cycle will retry",
                        exception);
                return;
            }
        }
    }
}
