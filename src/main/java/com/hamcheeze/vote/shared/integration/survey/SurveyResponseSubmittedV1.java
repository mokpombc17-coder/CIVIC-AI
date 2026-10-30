package com.hamcheeze.vote.shared.integration.survey;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record SurveyResponseSubmittedV1(
        String userId,
        UUID responseId,
        UUID roundId,
        UUID contentVersionId,
        Instant submittedAt
) {

    public static final String EVENT_TYPE = "survey.response-submitted";
    public static final String AGGREGATE_TYPE = "SURVEY_RESPONSE";
    public static final int SCHEMA_VERSION = 1;

    public SurveyResponseSubmittedV1 {
        Objects.requireNonNull(userId, "userId");
        if (userId.isBlank()) {
            throw new IllegalArgumentException("userId must not be blank");
        }
        if (!userId.equals(userId.strip())) {
            throw new IllegalArgumentException(
                    "userId must not contain surrounding whitespace");
        }
        Objects.requireNonNull(responseId, "responseId");
        Objects.requireNonNull(roundId, "roundId");
        Objects.requireNonNull(contentVersionId, "contentVersionId");
        Objects.requireNonNull(submittedAt, "submittedAt");
    }
}
