package com.hamcheeze.vote.task.domain.result;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.time.Instant;
import java.util.Objects;
import java.util.regex.Pattern;

public record TaskResultManifest(
        TaskId taskId,
        int resultVersion,
        String schemaVersion,
        Instant closedAt,
        int responseCount,
        String bodySha256,
        Instant finalizedAt
) {

    private static final Pattern LOWERCASE_SHA_256 =
            Pattern.compile("[0-9a-f]{64}");

    public TaskResultManifest {
        Objects.requireNonNull(taskId, "taskId");
        if (resultVersion < 1) {
            throw new IllegalArgumentException(
                    "resultVersion must be positive");
        }
        schemaVersion = requireText(schemaVersion, "schemaVersion");
        Objects.requireNonNull(closedAt, "closedAt");
        if (responseCount < 0) {
            throw new IllegalArgumentException(
                    "responseCount must not be negative");
        }
        bodySha256 = requireText(bodySha256, "bodySha256");
        if (!LOWERCASE_SHA_256.matcher(bodySha256).matches()) {
            throw new IllegalArgumentException(
                    "bodySha256 must be lowercase SHA-256 hex");
        }
        Objects.requireNonNull(finalizedAt, "finalizedAt");
        if (finalizedAt.isBefore(closedAt)) {
            throw new IllegalArgumentException(
                    "finalizedAt must not be before closedAt");
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
