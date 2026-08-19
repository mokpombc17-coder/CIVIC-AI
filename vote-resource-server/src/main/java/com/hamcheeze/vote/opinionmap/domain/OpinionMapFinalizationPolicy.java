package com.hamcheeze.vote.opinionmap.domain;

import java.util.Objects;

public final class OpinionMapFinalizationPolicy {

    private OpinionMapFinalizationPolicy() {
    }

    public static OpinionMapFinalizationDecision assess(
            OpinionMapFinalizationRequest request,
            int projectedSubmissionCount
    ) {
        Objects.requireNonNull(request, "request");
        if (projectedSubmissionCount < 0) {
            throw new IllegalArgumentException(
                    "projectedSubmissionCount must not be negative");
        }

        int expectedSubmissionCount = request.expectedSubmissionCount();
        OpinionMapFinalizationStatus status;
        if (projectedSubmissionCount < expectedSubmissionCount) {
            status = OpinionMapFinalizationStatus.WAITING_FOR_SUBMISSIONS;
        } else if (projectedSubmissionCount == expectedSubmissionCount) {
            status = OpinionMapFinalizationStatus.READY_TO_FINALIZE;
        } else {
            status = OpinionMapFinalizationStatus.SUBMISSION_COUNT_INCONSISTENT;
        }
        return new OpinionMapFinalizationDecision(
                status, expectedSubmissionCount, projectedSubmissionCount);
    }
}
