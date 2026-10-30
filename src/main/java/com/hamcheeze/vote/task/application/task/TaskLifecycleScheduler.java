package com.hamcheeze.vote.task.application.task;

import com.hamcheeze.vote.task.application.preparation.TaskPreparationService;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import org.springframework.beans.factory.annotation.Autowired;
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
    private final TaskPreparationService preparations;
    private final int batchSize;

    @Autowired
    public TaskLifecycleScheduler(
            TaskAdministrationService tasks,
            TaskPreparationService preparations,
            @Value("${vote.task.lifecycle.batch-size:100}") int batchSize
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.preparations = Objects.requireNonNull(
                preparations, "preparations");
        if (batchSize < 1) {
            throw new IllegalArgumentException("batchSize must be positive");
        }
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString =
            "${vote.task.lifecycle.scheduler-delay:1s}",
            scheduler = "taskLifecycleTaskScheduler")
    public void runScheduled() {
        transitionAvailable();
    }

    public int transitionAvailable() {
        int transitioned = 0;
        int inspected = 0;
        while (inspected < batchSize) {
            var candidate = tasks.findNextLifecycleCandidate();
            if (candidate.isEmpty()) {
                break;
            }
            inspected++;
            if (candidate.get().requiresPreparationVerification()) {
                try {
                    preparations.verifyReady(candidate.get().taskId());
                } catch (TaskDomainException exception) {
                    preparations.deferPublicationVerification(
                            candidate.get().taskId());
                    continue;
                }
            }
            if (tasks.transitionLifecycleCandidate(
                    candidate.get()).isPresent()) {
                transitioned++;
            }
        }
        return transitioned;
    }
}
