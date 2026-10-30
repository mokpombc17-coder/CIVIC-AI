package com.hamcheeze.vote.survey.application.idempotency;

import com.hamcheeze.vote.survey.domain.common.SurveyUserId;

import java.util.Objects;

public record SurveyIdempotencyCommand(
        SurveyUserId userId,
        SurveyIdempotencyOperation operation,
        SurveyIdempotencyKey idempotencyKey,
        SurveyRequestHash requestHash,
        int outcomeSchemaVersion
) {

    public SurveyIdempotencyCommand {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(operation, "operation");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        Objects.requireNonNull(requestHash, "requestHash");
        if (outcomeSchemaVersion <= 0) {
            throw new IllegalArgumentException(
                    "outcomeSchemaVersion must be positive");
        }
    }
}
