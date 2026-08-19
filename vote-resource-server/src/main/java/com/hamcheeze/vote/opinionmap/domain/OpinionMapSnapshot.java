package com.hamcheeze.vote.opinionmap.domain;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;

public record OpinionMapSnapshot(
        UUID snapshotId,
        UUID taskId,
        OpinionMapTaskClosureType closureType,
        Instant closedAt,
        int expectedSubmissionCount,
        int responseCount,
        Instant finalizedAt
) {

    public OpinionMapSnapshot {
        Objects.requireNonNull(snapshotId, "snapshotId");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(closureType, "closureType");
        Objects.requireNonNull(closedAt, "closedAt");
        Objects.requireNonNull(finalizedAt, "finalizedAt");
        if (expectedSubmissionCount < 0) {
            throw new IllegalArgumentException(
                    "expectedSubmissionCount must not be negative");
        }
        if (responseCount != expectedSubmissionCount) {
            throw new IllegalArgumentException(
                    "responseCount must match expectedSubmissionCount");
        }
        closedAt = closedAt.truncatedTo(ChronoUnit.MICROS);
        finalizedAt = finalizedAt.truncatedTo(ChronoUnit.MICROS);
        if (finalizedAt.isBefore(closedAt)) {
            throw new IllegalArgumentException(
                    "finalizedAt must not be before closedAt");
        }
    }

    public static OpinionMapSnapshot finalize(
            UUID snapshotId,
            OpinionMapFinalization finalization,
            Instant finalizedAt
    ) {
        Objects.requireNonNull(finalization, "finalization");
        if (finalization.status()
                != OpinionMapFinalizationStatus.READY_TO_FINALIZE) {
            throw new IllegalArgumentException(
                    "only a ready finalization can create a snapshot");
        }
        return new OpinionMapSnapshot(
                snapshotId,
                finalization.taskId(),
                finalization.closureType(),
                finalization.closedAt(),
                finalization.expectedSubmissionCount(),
                finalization.projectedSubmissionCount(),
                finalizedAt);
    }

    public boolean matches(OpinionMapFinalization finalization) {
        Objects.requireNonNull(finalization, "finalization");
        return taskId.equals(finalization.taskId())
                && closureType == finalization.closureType()
                && closedAt.equals(finalization.closedAt())
                && expectedSubmissionCount
                == finalization.expectedSubmissionCount()
                && responseCount
                == finalization.projectedSubmissionCount();
    }
}
