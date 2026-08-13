package com.hamcheeze.vote.survey.application.idempotency;

public enum SurveyIdempotencyReceiptStatus {
    PROCESSING,
    SUCCEEDED,
    REJECTED
}
