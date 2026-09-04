package com.hamcheeze.vote.task.domain.prediction;

public enum TaskPredictionAttemptOutcome {
    IN_PROGRESS,
    SUCCEEDED,
    REMOTE_PROCESSING,
    TIMEOUT,
    NETWORK_ERROR,
    HTTP_ERROR,
    INVALID_RESPONSE,
    LEASE_EXPIRED,
    IGNORED_LATE_RESPONSE;

    public boolean completed() {
        return this != IN_PROGRESS;
    }
}
