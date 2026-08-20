package com.hamcheeze.vote.survey.application.integration;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record SurveyResponseSubmittedReplayAudit(
        UUID originalEventId,
        UUID replayEventId,
        String requestedBy,
        Instant requestedAt,
        String reason
) {

    public static final int MAX_REQUESTED_BY_LENGTH = 200;
    public static final int MAX_REASON_LENGTH = 1000;

    public SurveyResponseSubmittedReplayAudit {
        Objects.requireNonNull(originalEventId, "originalEventId");
        Objects.requireNonNull(replayEventId, "replayEventId");
        if (originalEventId.equals(replayEventId)) {
            throw new IllegalArgumentException(
                    "replay event ID must differ from original event ID");
        }
        requestedBy = requireText(
                requestedBy, "requestedBy", MAX_REQUESTED_BY_LENGTH);
        Objects.requireNonNull(requestedAt, "requestedAt");
        reason = requireText(reason, "reason", MAX_REASON_LENGTH);
    }

    private static String requireText(
            String value,
            String field,
            int maxLength
    ) {
        Objects.requireNonNull(value, field);
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > maxLength) {
            throw new IllegalArgumentException(
                    field + " must contain 1 to " + maxLength
                            + " trimmed characters");
        }
        return normalized;
    }
}
