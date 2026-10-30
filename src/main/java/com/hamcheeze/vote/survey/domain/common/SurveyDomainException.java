package com.hamcheeze.vote.survey.domain.common;

import java.util.Objects;

public final class SurveyDomainException extends RuntimeException {

    private final SurveyViolation violation;

    public SurveyDomainException(SurveyViolation violation) {
        super(Objects.requireNonNull(violation, "violation").message());
        this.violation = violation;
    }

    public static SurveyDomainException invariant(
            String code,
            String path,
            String message
    ) {
        return new SurveyDomainException(
                SurveyViolation.of(code, path, message));
    }

    public SurveyViolation violation() {
        return violation;
    }
}
