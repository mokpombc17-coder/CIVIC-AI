package com.hamcheeze.vote.opinionmap.domain;

import java.util.Objects;

public record OpinionMapFinalizationDecision(
        OpinionMapFinalizationStatus status,
        int expectedSubmissionCount,
        int projectedSubmissionCount
) {

    public OpinionMapFinalizationDecision {
        Objects.requireNonNull(status, "status");
        if (expectedSubmissionCount < 0 || projectedSubmissionCount < 0) {
            throw new IllegalArgumentException(
                    "submission counts must not be negative");
        }
        boolean valid = switch (status) {
            case WAITING_FOR_SUBMISSIONS ->
                    projectedSubmissionCount < expectedSubmissionCount;
            case READY_TO_FINALIZE ->
                    projectedSubmissionCount == expectedSubmissionCount;
            case SUBMISSION_COUNT_INCONSISTENT ->
                    projectedSubmissionCount > expectedSubmissionCount;
        };
        if (!valid) {
            throw new IllegalArgumentException(
                    "finalization status must match submission counts");
        }
    }

    public int missingSubmissionCount() {
        return Math.max(expectedSubmissionCount - projectedSubmissionCount, 0);
    }

    public int excessSubmissionCount() {
        return Math.max(projectedSubmissionCount - expectedSubmissionCount, 0);
    }

    public boolean readyToFinalize() {
        return status == OpinionMapFinalizationStatus.READY_TO_FINALIZE;
    }
}
