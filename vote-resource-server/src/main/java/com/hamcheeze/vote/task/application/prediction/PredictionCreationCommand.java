package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.task.Task;

import java.time.Duration;
import java.util.Objects;

public record PredictionCreationCommand(
        TaskPredictionId requestId,
        TaskPersonaId personaId,
        Task task,
        String candidatePolicyVersion,
        int requestSchemaVersion,
        String requestPayload,
        String requestFingerprint,
        Duration requestTimeout
) {
    public PredictionCreationCommand {
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(personaId, "personaId");
        Objects.requireNonNull(task, "task");
        if (candidatePolicyVersion == null
                || candidatePolicyVersion.isBlank()) {
            throw new IllegalArgumentException(
                    "candidatePolicyVersion must not be blank");
        }
        candidatePolicyVersion = candidatePolicyVersion.trim();
        if (requestSchemaVersion < 1) {
            throw new IllegalArgumentException(
                    "requestSchemaVersion must be positive");
        }
        if (requestPayload == null || requestPayload.isBlank()) {
            throw new IllegalArgumentException(
                    "requestPayload must not be blank");
        }
        if (!TaskPredictionInputSnapshot.fingerprint(requestPayload)
                .equals(requestFingerprint)) {
            throw new TaskPredictionInputException(
                    TaskPredictionInputException.ErrorCode
                            .FINGERPRINT_MISMATCH,
                    "request fingerprint does not match payload");
        }
        Objects.requireNonNull(requestTimeout, "requestTimeout");
        if (requestTimeout.isZero() || requestTimeout.isNegative()) {
            throw new IllegalArgumentException(
                    "requestTimeout must be positive");
        }
    }

}
