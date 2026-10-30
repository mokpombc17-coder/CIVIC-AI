package com.hamcheeze.vote.survey.application.idempotency;

public enum SurveyIdempotencyErrorCode {
    INVALID_IDEMPOTENCY_KEY,
    IDEMPOTENCY_CONFLICT
}
