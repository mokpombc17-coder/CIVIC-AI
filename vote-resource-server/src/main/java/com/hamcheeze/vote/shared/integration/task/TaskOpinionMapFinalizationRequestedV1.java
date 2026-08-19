package com.hamcheeze.vote.shared.integration.task;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;

public record TaskOpinionMapFinalizationRequestedV1(
        UUID taskId,
        ClosureType closureType,
        Instant closedAt,
        int expectedSubmissionCount
) {

    public static final String EVENT_TYPE =
            "task.opinion-map-finalization-requested";
    public static final String AGGREGATE_TYPE = "TASK";
    public static final int SCHEMA_VERSION = 1;

    public TaskOpinionMapFinalizationRequestedV1 {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(closureType, "closureType");
        Objects.requireNonNull(closedAt, "closedAt");
        closedAt = closedAt.truncatedTo(ChronoUnit.MICROS);
        if (expectedSubmissionCount < 0) {
            throw new IllegalArgumentException(
                    "expectedSubmissionCount must not be negative");
        }
    }

    public enum ClosureType {
        DEADLINE_REACHED,
        EARLY_CLOSED
    }
}
