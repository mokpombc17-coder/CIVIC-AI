package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRetryPolicy;

import java.util.Objects;

public record TaskPredictionApplicationPolicy(
        String candidatePolicyVersion,
        int requestedCandidateCount,
        TaskPredictionRetryPolicy retryPolicy,
        int batchSize
) {
    public TaskPredictionApplicationPolicy {
        if (candidatePolicyVersion == null
                || candidatePolicyVersion.isBlank()) {
            throw new IllegalArgumentException(
                    "candidatePolicyVersion must not be blank");
        }
        candidatePolicyVersion = candidatePolicyVersion.trim();
        if (requestedCandidateCount < 1) {
            throw new IllegalArgumentException(
                    "requestedCandidateCount must be positive");
        }
        Objects.requireNonNull(retryPolicy, "retryPolicy");
        if (batchSize < 1) {
            throw new IllegalArgumentException("batchSize must be positive");
        }
    }
}
