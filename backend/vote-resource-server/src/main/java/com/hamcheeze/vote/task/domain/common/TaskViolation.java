package com.hamcheeze.vote.task.domain.common;

import java.util.Map;
import java.util.Objects;

public record TaskViolation(
        String code,
        String path,
        String message,
        Map<String, String> details
) {

    public TaskViolation {
        code = requireText(code, "code");
        path = requireText(path, "path");
        message = requireText(message, "message");
        details = Map.copyOf(Objects.requireNonNull(details, "details"));
    }

    public static TaskViolation of(
            String code,
            String path,
            String message
    ) {
        return new TaskViolation(code, path, message, Map.of());
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value;
    }
}
