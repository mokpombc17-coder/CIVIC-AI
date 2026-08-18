package com.hamcheeze.vote.task.domain.prediction;

public enum TaskPredictionAttemptOutcome {
    IN_PROGRESS,
    SUCCEEDED,
    TIMEOUT,
    NETWORK_ERROR,
    HTTP_ERROR,
    INVALID_RESPONSE,
    IGNORED_LATE_RESPONSE;

    public boolean completed() {
        return this != IN_PROGRESS;
    }
}
