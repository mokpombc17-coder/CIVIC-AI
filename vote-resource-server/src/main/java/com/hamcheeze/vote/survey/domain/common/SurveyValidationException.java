package com.hamcheeze.vote.survey.domain.common;

import java.util.List;
import java.util.Objects;

public final class SurveyValidationException extends RuntimeException {

    private final List<SurveyViolation> violations;

    public SurveyValidationException(List<SurveyViolation> violations) {
        super(messageFor(violations));
        this.violations = List.copyOf(violations);
    }

    public List<SurveyViolation> violations() {
        return violations;
    }

    private static String messageFor(List<SurveyViolation> violations) {
        Objects.requireNonNull(violations, "violations");
        if (violations.isEmpty()) {
            throw new IllegalArgumentException(
                    "violations must not be empty");
        }
        if (violations.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "violations must not contain null");
        }
        return "Survey validation failed with "
                + violations.size()
                + " violation(s)";
    }
}
