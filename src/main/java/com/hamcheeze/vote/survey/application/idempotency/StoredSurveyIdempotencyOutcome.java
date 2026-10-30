package com.hamcheeze.vote.survey.application.idempotency;

import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;

import java.util.Optional;

public record StoredSurveyIdempotencyOutcome(
        int schemaVersion,
        int httpStatus,
        String payload,
        SurveyResponseId responseId
) {

    public StoredSurveyIdempotencyOutcome {
        if (schemaVersion <= 0) {
            throw new IllegalArgumentException(
                    "schemaVersion must be positive");
        }
        boolean succeeded = httpStatus >= 200 && httpStatus <= 299;
        boolean rejected = httpStatus >= 400 && httpStatus <= 499;
        if (!succeeded && !rejected) {
            throw new IllegalArgumentException(
                    "httpStatus must be a 2xx success or 4xx rejection");
        }
        if (payload == null || payload.isBlank()) {
            throw new IllegalArgumentException(
                    "payload must not be blank");
        }
        if (succeeded && responseId == null) {
            throw new IllegalArgumentException(
                    "successful outcome requires responseId");
        }
        if (rejected && responseId != null) {
            throw new IllegalArgumentException(
                    "rejected outcome must not have responseId");
        }
    }

    public boolean succeeded() {
        return httpStatus >= 200 && httpStatus <= 299;
    }

    public Optional<SurveyResponseId> optionalResponseId() {
        return Optional.ofNullable(responseId);
    }
}
