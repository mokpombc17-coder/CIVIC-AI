package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRetryPolicy;

import java.util.Objects;
import java.time.Duration;

public record TaskPredictionApplicationPolicy(
        String candidatePolicyVersion,
        TaskPredictionRetryPolicy retryPolicy,
        Duration processingLeaseDuration,
        int batchSize
) {
    public TaskPredictionApplicationPolicy {
        if (candidatePolicyVersion == null
                || candidatePolicyVersion.isBlank()) {
            throw new IllegalArgumentException(
                    "candidatePolicyVersion must not be blank");
        }
        candidatePolicyVersion = candidatePolicyVersion.trim();
        Objects.requireNonNull(retryPolicy, "retryPolicy");
        Objects.requireNonNull(
                processingLeaseDuration, "processingLeaseDuration");
        if (processingLeaseDuration.compareTo(
                retryPolicy.requestTimeout()) <= 0) {
            throw new IllegalArgumentException(
                    "processingLeaseDuration must exceed requestTimeout");
        }
        if (batchSize < 1) {
            throw new IllegalArgumentException("batchSize must be positive");
        }
    }

    public TaskPredictionApplicationPolicy(
            String candidatePolicyVersion,
            TaskPredictionRetryPolicy retryPolicy,
            int batchSize
    ) {
        this(candidatePolicyVersion, retryPolicy,
                retryPolicy.requestTimeout().plusSeconds(30), batchSize);
    }
}
