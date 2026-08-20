package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionError;
import com.hamcheeze.vote.task.domain.task.Task;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import com.hamcheeze.vote.task.infra.prediction.TaskPredictionMetrics;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

@Service
@ConditionalOnProperty(
        prefix = "vote.task.prediction",
        name = "enabled",
        havingValue = "true")
public class TaskPredictionMaintenanceService {

    private final TaskPredictionRepository predictions;
    private final TaskRepository tasks;
    private final TaskPredictionApplicationPolicy policy;
    private final Clock clock;
    private TaskPredictionMetrics metrics;

    @Autowired(required = false)
    void setMetrics(TaskPredictionMetrics metrics) {
        this.metrics = metrics;
    }

    @Autowired
    public TaskPredictionMaintenanceService(
            TaskPredictionRepository predictions,
            TaskRepository tasks,
            TaskPredictionApplicationPolicy policy
    ) {
        this(predictions, tasks, policy, Clock.systemUTC());
    }

    TaskPredictionMaintenanceService(
            TaskPredictionRepository predictions,
            TaskRepository tasks,
            TaskPredictionApplicationPolicy policy,
            Clock clock
    ) {
        this.predictions = Objects.requireNonNull(predictions, "predictions");
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public boolean recoverNextExpiredLease() {
        Instant now = clock.instant();
        Optional<TaskPrediction> found =
                predictions.findNextExpiredLeaseForUpdate(now);
        if (found.isEmpty()) {
            return false;
        }
        TaskPrediction prediction = found.orElseThrow();
        TaskPredictionAttempt attempt = activeAttempt(prediction);
        prediction.expireLease(attempt.id(), policy.retryPolicy(), now);
        Task task = requireTask(prediction);
        if (prediction.nextRetryAt() != null
                && !prediction.nextRetryAt().isBefore(
                        task.schedule().scheduledCloseAt())) {
            prediction.failDeadline(deadlineError(), now);
        }
        predictions.save(prediction);
        predictions.saveAttempt(attempt.complete(
                TaskPredictionAttemptOutcome.LEASE_EXPIRED,
                null, null,
                "TASK_PREDICTION_PROCESSING_LEASE_EXPIRED",
                "task prediction processing lease expired", now));
        if (metrics != null) {
            metrics.leaseExpired();
        }
        return true;
    }

    @Transactional
    public boolean expireNextDeadline() {
        Instant now = clock.instant();
        Optional<TaskPrediction> found =
                predictions.findNextDeadlineExpiredForUpdate(now);
        if (found.isEmpty()) {
            return false;
        }
        TaskPrediction prediction = found.orElseThrow();
        if (prediction.activeAttemptId() != null) {
            TaskPredictionAttempt attempt = activeAttempt(prediction);
            predictions.saveAttempt(attempt.complete(
                    TaskPredictionAttemptOutcome.IGNORED_LATE_RESPONSE,
                    null, null,
                    "TASK_PREDICTION_DEADLINE_EXPIRED",
                    "task deadline elapsed while prediction was processing",
                    now));
        }
        prediction.failDeadline(deadlineError(), now);
        predictions.save(prediction);
        if (metrics != null) {
            metrics.deadlineExpired();
        }
        return true;
    }

    private TaskPredictionAttempt activeAttempt(TaskPrediction prediction) {
        return predictions.findAttempts(prediction.id()).stream()
                .filter(attempt -> attempt.id().equals(
                        prediction.activeAttemptId()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "active task prediction attempt is missing"));
    }

    private Task requireTask(TaskPrediction prediction) {
        return tasks.findById(prediction.taskId())
                .orElseThrow(() -> new IllegalStateException(
                        "prediction references a missing task"));
    }

    private static TaskPredictionError deadlineError() {
        return new TaskPredictionError(
                "TASK_PREDICTION_DEADLINE_EXPIRED",
                "task deadline elapsed before prediction completion");
    }
}
