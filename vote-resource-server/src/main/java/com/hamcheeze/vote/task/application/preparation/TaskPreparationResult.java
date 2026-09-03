package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

public record TaskPreparationResult(
        int schemaVersion,
        UUID requestId,
        TaskId taskId,
        String contentFingerprint,
        TaskPreparationStatus status,
        Instant preparedAt,
        Error error
) {

    private static final Pattern FINGERPRINT = Pattern.compile(
            "^sha256:[0-9a-f]{64}$");

    public TaskPreparationResult {
        if (schemaVersion != 1) {
            throw new IllegalArgumentException(
                    "schemaVersion must be 1");
        }
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(taskId, "taskId");
        if (contentFingerprint == null
                || !FINGERPRINT.matcher(contentFingerprint).matches()) {
            throw new IllegalArgumentException(
                    "contentFingerprint must be a sha256 fingerprint");
        }
        Objects.requireNonNull(status, "status");
        if (status != TaskPreparationStatus.READY
                && status != TaskPreparationStatus.FAILED
                && status != TaskPreparationStatus.REJECTED) {
            throw new IllegalArgumentException(
                    "callback status must be terminal");
        }
        if (status == TaskPreparationStatus.READY) {
            if (preparedAt == null || error != null) {
                throw new IllegalArgumentException(
                        "READY requires preparedAt and no error");
            }
        } else {
            if (preparedAt != null || error == null) {
                throw new IllegalArgumentException(
                        "FAILED or REJECTED requires an error only");
            }
            boolean expectedRetryable =
                    status == TaskPreparationStatus.FAILED;
            if (error.retryable() != expectedRetryable) {
                throw new IllegalArgumentException(
                        "error.retryable does not match status");
            }
        }
    }

    public record Error(
            String code,
            String detail,
            boolean retryable
    ) {

        public Error {
            code = requireText(code, "error.code", 120);
            detail = requireText(detail, "error.detail", 1000);
        }

        private static String requireText(
                String value,
                String field,
                int maxLength
        ) {
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException(
                        field + " must not be blank");
            }
            String normalized = value.strip();
            if (normalized.length() > maxLength) {
                throw new IllegalArgumentException(
                        field + " is too long");
            }
            return normalized;
        }
    }
}
