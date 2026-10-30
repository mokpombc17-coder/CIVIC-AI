package com.hamcheeze.vote.survey.domain.common;

import java.util.Map;
import java.util.Objects;

public record SurveyViolation(
        String code,
        String path,
        String message,
        Map<String, String> details
) {

    public SurveyViolation {
        code = requireText(code, "code");
        path = requireText(path, "path");
        message = requireText(message, "message");
        details = Map.copyOf(Objects.requireNonNull(details, "details"));
    }

    public static SurveyViolation of(
            String code,
            String path,
            String message
    ) {
        return new SurveyViolation(code, path, message, Map.of());
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value;
    }
}
