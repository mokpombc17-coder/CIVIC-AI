package com.hamcheeze.vote.task.application.task;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
@ConditionalOnProperty(
        prefix = "vote.task.lifecycle",
        name = "enabled",
        havingValue = "true")
public class TaskLifecycleScheduler {

    private final TaskAdministrationService tasks;
    private final int batchSize;

    public TaskLifecycleScheduler(
            TaskAdministrationService tasks,
            @Value("${vote.task.lifecycle.batch-size:100}") int batchSize
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        if (batchSize < 1) {
            throw new IllegalArgumentException("batchSize must be positive");
        }
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString =
            "${vote.task.lifecycle.scheduler-delay:1s}")
    public void runScheduled() {
        transitionAvailable();
    }

    public int transitionAvailable() {
        int transitioned = 0;
        while (transitioned < batchSize
                && tasks.transitionNextDue().isPresent()) {
            transitioned++;
        }
        return transitioned;
    }
}
