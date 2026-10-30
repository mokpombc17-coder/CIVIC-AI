package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.infra.PersonaGenerationProperties;
import com.hamcheeze.vote.persona.infra.PersonaGenerationMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.concurrent.RejectedExecutionException;

@Component
@ConditionalOnProperty(prefix = "vote.persona", name = "enabled", havingValue = "true")
public class PersonaGenerationDispatcher {

    private static final Logger log = LoggerFactory.getLogger(
            PersonaGenerationDispatcher.class);

    private final PersonaGenerationWorker worker;
    private final ThreadPoolTaskExecutor executor;
    private final PersonaGenerationProperties properties;
    private final PersonaGenerationMetrics metrics;

    public PersonaGenerationDispatcher(
            PersonaGenerationWorker worker,
            @Qualifier("personaGenerationExecutor")
            ThreadPoolTaskExecutor executor,
            PersonaGenerationProperties properties,
            PersonaGenerationMetrics metrics
    ) {
        this.worker = Objects.requireNonNull(worker, "worker");
        this.executor = Objects.requireNonNull(executor, "executor");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
    }

    @Scheduled(
            fixedDelayString = "${vote.persona.dispatcher-delay:5s}",
            scheduler = "personaGenerationScheduler")
    public void dispatchScheduled() {
        dispatchAvailable();
    }

    public int dispatchAvailable() {
        int submitted = 0;
        for (int index = 0; index < properties.getBatchSize(); index++) {
            try {
                executor.execute(worker::executeOne);
                submitted++;
            } catch (RejectedExecutionException exception) {
                metrics.workerRejected();
                log.warn(
                        "Persona worker task rejected: submitted={}, active={}, queueSize={}",
                        submitted, executor.getActiveCount(),
                        executor.getThreadPoolExecutor().getQueue().size());
                break;
            }
        }
        return submitted;
    }
}
