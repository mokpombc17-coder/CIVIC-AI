package com.hamcheeze.vote.task.application.prediction;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
@ConditionalOnProperty(
        prefix = "vote.task.prediction",
        name = "enabled",
        havingValue = "true")
public class TaskPredictionMaintenanceScheduler {

    private static final Logger log = LoggerFactory.getLogger(
            TaskPredictionMaintenanceScheduler.class);

    private final TaskPredictionMaintenanceService maintenance;
    private final TaskPredictionApplicationPolicy policy;

    public TaskPredictionMaintenanceScheduler(
            TaskPredictionMaintenanceService maintenance,
            TaskPredictionApplicationPolicy policy
    ) {
        this.maintenance = Objects.requireNonNull(
                maintenance, "maintenance");
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    @Scheduled(fixedDelayString =
            "${vote.task.prediction.lease-reaper-delay:10s}",
            scheduler = "taskPredictionTaskScheduler")
    public void runScheduled() {
        int leases = drain(true);
        int deadlines = drain(false);
        if (leases + deadlines > 0) {
            log.info("Task prediction maintenance completed: leases={}, deadlines={}",
                    leases, deadlines);
        }
    }

    private int drain(boolean leases) {
        int handled = 0;
        while (handled < policy.batchSize()) {
            boolean changed = leases
                    ? maintenance.recoverNextExpiredLease()
                    : maintenance.expireNextDeadline();
            if (!changed) {
                break;
            }
            handled++;
        }
        return handled;
    }
}
