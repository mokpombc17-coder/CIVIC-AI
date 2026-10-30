package com.hamcheeze.vote.task.application.opinionmap;

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
@ConditionalOnProperty(
        prefix = "vote.task.opinion-map",
        name = "enabled",
        havingValue = "true")
public class OpinionMapGenerationDispatcher {

    private static final Logger log = LoggerFactory.getLogger(
            OpinionMapGenerationDispatcher.class);

    private final OpinionMapGenerationWorker worker;
    private final OpinionMapGenerationPolicy policy;
    private final ThreadPoolTaskExecutor executor;

    public OpinionMapGenerationDispatcher(
            OpinionMapGenerationWorker worker,
            OpinionMapGenerationPolicy policy,
            @Qualifier("opinionMapGenerationExecutor")
            ThreadPoolTaskExecutor executor
    ) {
        this.worker = Objects.requireNonNull(worker, "worker");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.executor = Objects.requireNonNull(executor, "executor");
    }

    @Scheduled(
            fixedDelayString =
                    "${vote.task.opinion-map.dispatcher-delay:5s}",
            scheduler = "opinionMapGenerationTaskScheduler")
    public void dispatchScheduled() {
        dispatchAvailable();
    }

    public int dispatchAvailable() {
        int accepted = 0;
        for (int index = 0; index < policy.batchSize(); index++) {
            try {
                executor.execute(worker::executeOne);
                accepted++;
            } catch (RejectedExecutionException exception) {
                log.warn(
                        "Opinion Map worker queue is full: accepted={}",
                        accepted);
                break;
            }
        }
        return accepted;
    }
}
