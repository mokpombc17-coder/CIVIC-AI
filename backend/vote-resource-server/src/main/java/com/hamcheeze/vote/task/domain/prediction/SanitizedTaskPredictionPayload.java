package com.hamcheeze.vote.task.domain.prediction;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;

public final class SanitizedTaskPredictionPayload {

    private final String value;

    private SanitizedTaskPredictionPayload(String value) {
        if (value == null || value.isBlank()) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_PAYLOAD_REQUIRED",
                    "payload",
                    "sanitized payload must not be blank");
        }
        this.value = value;
    }

    public static SanitizedTaskPredictionPayload fromSanitized(String value) {
        return new SanitizedTaskPredictionPayload(value);
    }

    public String value() {
        return value;
    }
}
