package com.hamcheeze.vote.task.application.opinionmap;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record OpinionMapGenerationRunHistory(
        UUID runId,
        int resultVersion,
        int runNumber,
        OpinionMapGenerationRun.Trigger trigger,
        OpinionMapGenerationRun.Status status,
        int attemptCount,
        String requestedBy,
        Instant requestedAt,
        Instant completedAt,
        String lastErrorCode,
        List<Attempt> attempts
) {

    public OpinionMapGenerationRunHistory {
        Objects.requireNonNull(runId, "runId");
        Objects.requireNonNull(trigger, "trigger");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(requestedAt, "requestedAt");
        attempts = List.copyOf(attempts);
    }

    public record Attempt(
            UUID attemptId,
            int attemptNumber,
            String status,
            String provider,
            String requestedModel,
            String responseModel,
            String providerGenerationId,
            String providerRequestId,
            Long promptTokens,
            Long completionTokens,
            Long totalTokens,
            Long cachedTokens,
            Long reasoningTokens,
            BigDecimal cost,
            String currency,
            String finishReason,
            Integer httpStatus,
            String errorCode,
            Boolean retryable,
            Instant startedAt,
            Instant completedAt,
            Long latencyMs
    ) {
        public Attempt {
            Objects.requireNonNull(attemptId, "attemptId");
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(provider, "provider");
            Objects.requireNonNull(requestedModel, "requestedModel");
            Objects.requireNonNull(startedAt, "startedAt");
        }
    }
}
