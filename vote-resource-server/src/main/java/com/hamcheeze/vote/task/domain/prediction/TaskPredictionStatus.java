package com.hamcheeze.vote.task.domain.prediction;

public enum TaskPredictionStatus {
    PENDING,
    PROCESSING,
    RETRY_WAIT,
    SUCCEEDED,
    FAILED;

    public boolean terminal() {
        return this == SUCCEEDED || this == FAILED;
    }
}
