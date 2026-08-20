package com.hamcheeze.vote.task.application.prediction;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.concurrent.RejectedExecutionException;
import com.hamcheeze.vote.task.infra.prediction.TaskPredictionMetrics;

@Component
@ConditionalOnProperty(
        prefix = "vote.task.prediction",
        name = "enabled",
        havingValue = "true")
public class TaskPredictionDispatcher {

    private static final Logger log = LoggerFactory.getLogger(
            TaskPredictionDispatcher.class);

    private final TaskPredictionWorker worker;
    private final TaskPredictionApplicationPolicy policy;
    private final ThreadPoolTaskExecutor executor;
    private final TaskPredictionStateService legacyStates;
    private TaskPredictionMetrics metrics;

    @Autowired(required = false)
    void setMetrics(TaskPredictionMetrics metrics) {
        this.metrics = metrics;
    }

    @Autowired
    public TaskPredictionDispatcher(
            TaskPredictionWorker worker,
            TaskPredictionApplicationPolicy policy,
            @Qualifier("taskPredictionExecutor")
            ThreadPoolTaskExecutor taskPredictionExecutor
    ) {
        this.worker = Objects.requireNonNull(worker, "worker");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.executor = Objects.requireNonNull(
                taskPredictionExecutor, "taskPredictionExecutor");
        this.legacyStates = null;
    }

    TaskPredictionDispatcher(
            TaskPredictionStateService states,
            com.hamcheeze.vote.task.application.port.out.PredictionCreationPort predictionCreation,
            TaskPredictionApplicationPolicy policy
    ) {
        this.worker = new TaskPredictionWorker(states, predictionCreation);
        this.policy = Objects.requireNonNull(policy, "policy");
        this.executor = null;
        this.legacyStates = states;
    }

    @Scheduled(fixedDelayString =
            "${vote.task.prediction.dispatcher-delay:5s}",
            scheduler = "taskPredictionTaskScheduler")
    public void dispatchScheduled() {
        dispatchAvailable();
    }

    public int dispatchAvailable() {
        if (executor == null) {
            int dispatched = 0;
            while (dispatched < policy.batchSize()) {
                java.util.Optional<TaskPredictionDispatchClaim> claim =
                        legacyStates.claimNext();
                if (claim.isEmpty()) {
                    break;
                }
                worker.executeClaim(claim.orElseThrow());
                dispatched++;
            }
            return dispatched;
        }
        int accepted = 0;
        for (int index = 0; index < policy.batchSize(); index++) {
            try {
                executor.execute(worker::executeOne);
                accepted++;
            } catch (RejectedExecutionException exception) {
                if (metrics != null) {
                    metrics.workerRejected();
                }
                log.warn("Task prediction worker queue is full: accepted={}",
                        accepted);
                break;
            }
        }
        return accepted;
    }
}
