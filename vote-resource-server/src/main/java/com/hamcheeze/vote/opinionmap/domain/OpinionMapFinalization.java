package com.hamcheeze.vote.opinionmap.domain;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;

public record OpinionMapFinalization(
        UUID taskId,
        OpinionMapTaskClosureType closureType,
        Instant closedAt,
        int expectedSubmissionCount,
        OpinionMapFinalizationStatus status,
        int projectedSubmissionCount,
        Instant evaluatedAt
) {

    public OpinionMapFinalization {
        OpinionMapFinalizationRequest request =
                new OpinionMapFinalizationRequest(
                        taskId, closureType, closedAt,
                        expectedSubmissionCount);
        OpinionMapFinalizationDecision decision =
                new OpinionMapFinalizationDecision(
                        status, expectedSubmissionCount,
                        projectedSubmissionCount);
        taskId = request.taskId();
        closureType = request.closureType();
        closedAt = request.closedAt();
        status = decision.status();
        Objects.requireNonNull(evaluatedAt, "evaluatedAt");
        evaluatedAt = evaluatedAt.truncatedTo(ChronoUnit.MICROS);
    }

    public static OpinionMapFinalization assess(
            OpinionMapFinalizationRequest request,
            int projectedSubmissionCount,
            Instant evaluatedAt
    ) {
        Objects.requireNonNull(request, "request");
        OpinionMapFinalizationDecision decision =
                OpinionMapFinalizationPolicy.assess(
                        request, projectedSubmissionCount);
        return new OpinionMapFinalization(
                request.taskId(),
                request.closureType(),
                request.closedAt(),
                request.expectedSubmissionCount(),
                decision.status(),
                decision.projectedSubmissionCount(),
                evaluatedAt);
    }

    public OpinionMapFinalizationRequest request() {
        return new OpinionMapFinalizationRequest(
                taskId, closureType, closedAt, expectedSubmissionCount);
    }

    public OpinionMapFinalizationDecision decision() {
        return new OpinionMapFinalizationDecision(
                status, expectedSubmissionCount, projectedSubmissionCount);
    }

    public boolean hasSameRequest(OpinionMapFinalizationRequest other) {
        return request().equals(Objects.requireNonNull(other, "other"));
    }

    public OpinionMapFinalization reassess(
            int currentProjectedSubmissionCount,
            Instant reassessedAt
    ) {
        return assess(
                request(), currentProjectedSubmissionCount, reassessedAt);
    }
}
