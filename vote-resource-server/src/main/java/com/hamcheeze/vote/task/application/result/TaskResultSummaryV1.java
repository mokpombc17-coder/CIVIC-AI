package com.hamcheeze.vote.task.application.result;

import java.util.List;
import java.util.Objects;

public record TaskResultSummaryV1(
        String schemaVersion,
        int resultVersion,
        int responseCount,
        List<OptionCount> options
) {

    public static final String SCHEMA_VERSION = "task-result-summary/v1";

    public TaskResultSummaryV1 {
        schemaVersion = requireText(schemaVersion, "schemaVersion");
        if (!SCHEMA_VERSION.equals(schemaVersion)) {
            throw new IllegalArgumentException("schemaVersion is unsupported");
        }
        if (resultVersion < 1) {
            throw new IllegalArgumentException(
                    "resultVersion must be positive");
        }
        if (responseCount < 0) {
            throw new IllegalArgumentException(
                    "responseCount must not be negative");
        }
        options = List.copyOf(Objects.requireNonNull(options, "options"));
        if (options.isEmpty()) {
            throw new IllegalArgumentException("options must not be empty");
        }
        int countedResponses = options.stream()
                .mapToInt(OptionCount::count)
                .sum();
        if (countedResponses != responseCount) {
            throw new IllegalArgumentException(
                    "option counts must sum to responseCount");
        }
    }

    public record OptionCount(String key, String content, int count) {

        public OptionCount {
            key = requireText(key, "key");
            content = requireText(content, "content");
            if (count < 0) {
                throw new IllegalArgumentException(
                        "count must not be negative");
            }
        }
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        if (value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value;
    }
}
