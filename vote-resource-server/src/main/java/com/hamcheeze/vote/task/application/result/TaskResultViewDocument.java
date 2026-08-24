package com.hamcheeze.vote.task.application.result;

import java.time.Instant;
import java.util.Objects;

public record TaskResultViewDocument(
        int resultVersion,
        String schemaVersion,
        Instant closedAt,
        int responseCount,
        String bodySha256,
        String content
) {

    public TaskResultViewDocument {
        if (resultVersion < 1) {
            throw new IllegalArgumentException(
                    "resultVersion must be positive");
        }
        Objects.requireNonNull(schemaVersion, "schemaVersion");
        Objects.requireNonNull(closedAt, "closedAt");
        if (responseCount < 0) {
            throw new IllegalArgumentException(
                    "responseCount must not be negative");
        }
        Objects.requireNonNull(bodySha256, "bodySha256");
        Objects.requireNonNull(content, "content");
    }
}
