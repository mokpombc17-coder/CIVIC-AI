package com.hamcheeze.vote.task.domain.prediction;

import java.util.Objects;

public record TaskPredictionRuntimeStatus(
        String code,
        String detail,
        boolean retryable,
        int maxWaitMinutes
) {
    private static final int MAX_DETAIL_LENGTH = 2_000;

    public TaskPredictionRuntimeStatus {
        if (code == null || code.isBlank() || code.length() > 200) {
            throw new IllegalArgumentException(
                    "runtimeStatus.code must contain 1 to 200 characters");
        }
        code = code.trim();
        Objects.requireNonNull(detail, "runtimeStatus.detail");
        if (detail.isBlank() || detail.length() > MAX_DETAIL_LENGTH) {
            throw new IllegalArgumentException(
                    "runtimeStatus.detail must contain 1 to 2000 characters");
        }
        if (maxWaitMinutes < 0) {
            throw new IllegalArgumentException(
                    "runtimeStatus.maxWaitMinutes must not be negative");
        }
    }
}
