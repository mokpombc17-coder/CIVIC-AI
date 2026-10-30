package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.infra.PersonaGenerationProperties;
import com.hamcheeze.vote.persona.infra.PersonaGenerationMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
@ConditionalOnProperty(prefix = "vote.persona", name = "enabled", havingValue = "true")
public class PersonaGenerationLeaseReaper {

    private static final Logger log = LoggerFactory.getLogger(
            PersonaGenerationLeaseReaper.class);

    private final PersonaGenerationStateService states;
    private final PersonaGenerationProperties properties;
    private final PersonaGenerationMetrics metrics;

    public PersonaGenerationLeaseReaper(
            PersonaGenerationStateService states,
            PersonaGenerationProperties properties,
            PersonaGenerationMetrics metrics
    ) {
        this.states = Objects.requireNonNull(states, "states");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
    }

    @Scheduled(
            fixedDelayString = "${vote.persona.lease-reaper-delay:10s}",
            initialDelayString = "${vote.persona.lease-reaper-initial-delay:0s}",
            scheduler = "personaGenerationScheduler")
    public void reapScheduled() {
        try {
            int reaped = states.reapExpired(properties.getBatchSize());
            metrics.leaseExpired(reaped);
            if (reaped > 0) {
                log.warn("Expired Persona generation leases reaped: count={}",
                        reaped);
            }
        } catch (RuntimeException exception) {
            log.error(
                    "Persona generation lease reaper failed; next polling cycle will retry",
                    exception);
        }
    }
}
