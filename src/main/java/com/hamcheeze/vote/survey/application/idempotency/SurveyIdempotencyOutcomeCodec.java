package com.hamcheeze.vote.survey.application.idempotency;

public interface SurveyIdempotencyOutcomeCodec<T> {

    StoredSurveyIdempotencyOutcome encode(T result);

    T decode(StoredSurveyIdempotencyOutcome storedOutcome);
}
