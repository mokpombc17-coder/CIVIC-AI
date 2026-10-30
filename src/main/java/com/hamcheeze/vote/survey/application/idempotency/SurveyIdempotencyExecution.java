package com.hamcheeze.vote.survey.application.idempotency;

import java.util.Objects;

public record SurveyIdempotencyExecution<T>(
        T result,
        boolean replayed
) {

    public SurveyIdempotencyExecution {
        Objects.requireNonNull(result, "result");
    }
}
