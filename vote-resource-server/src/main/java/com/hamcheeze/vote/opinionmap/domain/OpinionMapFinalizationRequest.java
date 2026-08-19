package com.hamcheeze.vote.opinionmap.domain;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;

public record OpinionMapFinalizationRequest(
        UUID taskId,
        OpinionMapTaskClosureType closureType,
        Instant closedAt,
        int expectedSubmissionCount
) {

    public OpinionMapFinalizationRequest {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(closureType, "closureType");
        Objects.requireNonNull(closedAt, "closedAt");
        closedAt = closedAt.truncatedTo(ChronoUnit.MICROS);
        if (expectedSubmissionCount < 0) {
            throw new IllegalArgumentException(
                    "expectedSubmissionCount must not be negative");
        }
    }
}
