package com.hamcheeze.vote.task.domain.prediction;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;

import java.time.Duration;
import java.util.Objects;

public record TaskPredictionRetryPolicy(
        Duration requestTimeout,
        int maximumAttempts,
        Duration retryDelay
) {
    public TaskPredictionRetryPolicy {
        Objects.requireNonNull(requestTimeout, "requestTimeout");
        Objects.requireNonNull(retryDelay, "retryDelay");
        if (requestTimeout.isZero() || requestTimeout.isNegative()) {
            throw invalid("requestTimeout", "requestTimeout must be positive");
        }
        if (maximumAttempts < 1) {
            throw invalid("maximumAttempts", "maximumAttempts must be positive");
        }
        if (retryDelay.isNegative()) {
            throw invalid("retryDelay", "retryDelay must not be negative");
        }
    }

    private static TaskDomainException invalid(String path, String message) {
        return TaskDomainException.invariant(
                "TASK_PREDICTION_RETRY_POLICY_INVALID", path, message);
    }
}
