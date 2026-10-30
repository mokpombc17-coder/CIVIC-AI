package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record OpinionMapGenerationRun(
        UUID runId,
        OpinionMapGenerationId generationId,
        int runNumber,
        Trigger trigger,
        Status status,
        int attemptCount,
        String requestedBy,
        Instant requestedAt,
        Instant completedAt,
        String lastErrorCode,
        Instant updatedAt
) {

    public OpinionMapGenerationRun {
        Objects.requireNonNull(runId, "runId");
        Objects.requireNonNull(generationId, "generationId");
        if (runNumber < 1) {
            throw new IllegalArgumentException("runNumber must be positive");
        }
        Objects.requireNonNull(trigger, "trigger");
        Objects.requireNonNull(status, "status");
        if (attemptCount < 0) {
            throw new IllegalArgumentException(
                    "attemptCount must not be negative");
        }
        Objects.requireNonNull(requestedAt, "requestedAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }

    public enum Trigger {
        TASK_CLOSED,
        ADMIN_RETRY,
        ADMIN_REGENERATE
    }

    public enum Status {
        PENDING,
        PROCESSING,
        RETRY_WAIT,
        AVAILABLE,
        UNAVAILABLE
    }
}
