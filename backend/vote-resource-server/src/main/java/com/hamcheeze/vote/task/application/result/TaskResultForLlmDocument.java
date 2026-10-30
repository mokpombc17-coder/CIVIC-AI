package com.hamcheeze.vote.task.application.result;

import java.util.Objects;

public record TaskResultForLlmDocument(
        String taskTitle,
        String schemaVersion,
        int resultVersion,
        int responseCount,
        String sourceBodySha256,
        String bodySha256,
        String content
) {

    public static final String CONTENT_TYPE =
            "application/x-ndjson;charset=UTF-8";

    public TaskResultForLlmDocument {
        Objects.requireNonNull(taskTitle, "taskTitle");
        Objects.requireNonNull(schemaVersion, "schemaVersion");
        if (resultVersion < 1) {
            throw new IllegalArgumentException(
                    "resultVersion must be positive");
        }
        if (responseCount < 0) {
            throw new IllegalArgumentException(
                    "responseCount must not be negative");
        }
        Objects.requireNonNull(sourceBodySha256, "sourceBodySha256");
        Objects.requireNonNull(bodySha256, "bodySha256");
        Objects.requireNonNull(content, "content");
    }
}
