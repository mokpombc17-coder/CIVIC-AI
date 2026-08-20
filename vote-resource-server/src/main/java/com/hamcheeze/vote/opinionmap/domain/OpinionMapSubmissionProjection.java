package com.hamcheeze.vote.opinionmap.domain;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;

public record OpinionMapSubmissionProjection(
        UUID submissionId,
        String userId,
        UUID taskId,
        UUID predictionId,
        UUID personaGenerationId,
        UUID personaVersionId,
        UUID questionId,
        UUID selectedOptionId,
        OpinionMapReasonSource reasonSource,
        UUID acceptedPredictedReasonId,
        String finalReason,
        Instant submittedAt
) {

    public OpinionMapSubmissionProjection {
        Objects.requireNonNull(submissionId, "submissionId");
        userId = requireText(userId, 255, "userId");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(personaGenerationId, "personaGenerationId");
        Objects.requireNonNull(personaVersionId, "personaVersionId");
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(selectedOptionId, "selectedOptionId");
        Objects.requireNonNull(reasonSource, "reasonSource");
        finalReason = requireText(finalReason, 500, "finalReason");
        Objects.requireNonNull(submittedAt, "submittedAt");
        submittedAt = submittedAt.truncatedTo(ChronoUnit.MICROS);
        if (reasonSource == OpinionMapReasonSource.AI_ACCEPTED
                && (predictionId == null
                || acceptedPredictedReasonId == null)) {
            throw new IllegalArgumentException(
                    "AI_ACCEPTED submission requires predicted reason ID");
        }
        if (reasonSource == OpinionMapReasonSource.USER_WRITTEN
                && acceptedPredictedReasonId != null) {
            throw new IllegalArgumentException(
                    "USER_WRITTEN submission must not have predicted reason ID");
        }
    }

    public boolean acceptedPredictedReason() {
        return reasonSource == OpinionMapReasonSource.AI_ACCEPTED;
    }

    private static String requireText(
            String value,
            int maxLength,
            String field
    ) {
        Objects.requireNonNull(value, field);
        if (value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        if (!value.equals(value.strip())) {
            throw new IllegalArgumentException(
                    field + " must not contain surrounding whitespace");
        }
        if (value.codePointCount(0, value.length()) > maxLength) {
            throw new IllegalArgumentException(
                    field + " must not exceed " + maxLength + " characters");
        }
        return value;
    }
}
