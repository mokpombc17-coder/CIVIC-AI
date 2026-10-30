package com.hamcheeze.vote.task.domain.common;

public final class TaskText {

    private TaskText() {
    }

    public static String required(
            String value,
            int maxLength,
            String codePrefix,
            String path
    ) {
        if (value == null || value.isBlank()) {
            throw TaskDomainException.invariant(
                    codePrefix + "_REQUIRED",
                    path,
                    path + " must not be blank");
        }
        String normalized = value.strip();
        ensureMaxLength(normalized, maxLength, codePrefix, path);
        return normalized;
    }

    public static String optional(
            String value,
            int maxLength,
            String codePrefix,
            String path
    ) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.strip();
        ensureMaxLength(normalized, maxLength, codePrefix, path);
        return normalized;
    }

    public static int codePointLength(String value) {
        return value.codePointCount(0, value.length());
    }

    private static void ensureMaxLength(
            String value,
            int maxLength,
            String codePrefix,
            String path
    ) {
        if (codePointLength(value) > maxLength) {
            throw TaskDomainException.invariant(
                    codePrefix + "_TOO_LONG",
                    path,
                    path + " must not exceed " + maxLength + " characters");
        }
    }
}
