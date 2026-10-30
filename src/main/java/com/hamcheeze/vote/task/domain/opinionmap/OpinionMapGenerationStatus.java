package com.hamcheeze.vote.task.domain.opinionmap;

public enum OpinionMapGenerationStatus {
    PENDING,
    PROCESSING,
    RETRY_WAIT,
    AVAILABLE,
    UNAVAILABLE
}
