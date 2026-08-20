package com.hamcheeze.vote.shared.integration.task;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record TaskSubmissionCompletedV3(
        String userId,
        UUID submissionId,
        UUID taskId,
        UUID predictionId,
        UUID personaGenerationId,
        UUID personaVersionId,
        UUID questionId,
        UUID selectedOptionId,
        ReasonSource reasonSource,
        UUID acceptedPredictedReasonId,
        String finalReason,
        Instant submittedAt
) {

    public static final String EVENT_TYPE = "task.submission-completed";
    public static final String AGGREGATE_TYPE = "TASK_SUBMISSION";
    public static final int SCHEMA_VERSION = 3;

    public TaskSubmissionCompletedV3 {
        userId = requireText(userId, 255, "userId");
        Objects.requireNonNull(submissionId, "submissionId");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(personaGenerationId, "personaGenerationId");
        Objects.requireNonNull(personaVersionId, "personaVersionId");
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(selectedOptionId, "selectedOptionId");
        Objects.requireNonNull(reasonSource, "reasonSource");
        finalReason = requireText(finalReason, 500, "finalReason");
        Objects.requireNonNull(submittedAt, "submittedAt");
        if (reasonSource == ReasonSource.AI_ACCEPTED
                && (predictionId == null
                || acceptedPredictedReasonId == null)) {
            throw new IllegalArgumentException(
                    "AI_ACCEPTED submission requires prediction provenance");
        }
        if (reasonSource == ReasonSource.USER_WRITTEN
                && acceptedPredictedReasonId != null) {
            throw new IllegalArgumentException(
                    "USER_WRITTEN submission must not have predicted reason ID");
        }
    }

    public enum ReasonSource {
        AI_ACCEPTED,
        USER_WRITTEN
    }

    private static String requireText(
            String value,
            int maxLength,
            String field
    ) {
        Objects.requireNonNull(value, field);
        if (value.isBlank() || !value.equals(value.strip())) {
            throw new IllegalArgumentException(
                    field + " must be non-blank and trimmed");
        }
        if (value.codePointCount(0, value.length()) > maxLength) {
            throw new IllegalArgumentException(
                    field + " must not exceed " + maxLength + " characters");
        }
        return value;
    }
}
