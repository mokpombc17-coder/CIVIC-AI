package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;

public record TaskPredictionInputSnapshot(
        TaskPredictionId predictionId,
        TaskId taskId,
        TaskUserId userId,
        TaskPersonaGenerationId personaGenerationId,
        TaskPersonaVersionId personaVersionId,
        TaskPersonaId providerPersonaId,
        Instant taskEndsAt,
        int requestSchemaVersion,
        String algorithmVersion,
        String requestPayload,
        String requestFingerprint,
        Instant createdAt
) {

    public TaskPredictionInputSnapshot {
        Objects.requireNonNull(predictionId, "predictionId");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(personaGenerationId, "personaGenerationId");
        Objects.requireNonNull(personaVersionId, "personaVersionId");
        Objects.requireNonNull(providerPersonaId, "providerPersonaId");
        Objects.requireNonNull(taskEndsAt, "taskEndsAt");
        if (requestSchemaVersion < 1) {
            throw new IllegalArgumentException(
                    "requestSchemaVersion must be positive");
        }
        algorithmVersion = requireText(algorithmVersion, "algorithmVersion");
        requestPayload = requireText(requestPayload, "requestPayload");
        requestFingerprint = requireText(
                requestFingerprint, "requestFingerprint");
        Objects.requireNonNull(createdAt, "createdAt");
        if (!requestFingerprint.matches("[0-9a-f]{64}")) {
            throw new TaskPredictionInputException(
                    TaskPredictionInputException.ErrorCode.INTEGRITY_ERROR,
                    "Task prediction input fingerprint is not lowercase SHA-256");
        }
        if (!fingerprint(requestPayload).equals(requestFingerprint)) {
            throw new TaskPredictionInputException(
                    TaskPredictionInputException.ErrorCode.FINGERPRINT_MISMATCH,
                    "Task prediction input fingerprint does not match payload");
        }
    }

    public static TaskPredictionInputSnapshot create(
            TaskPredictionId predictionId,
            TaskId taskId,
            TaskUserId userId,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            TaskPersonaId providerPersonaId,
            Instant taskEndsAt,
            int requestSchemaVersion,
            String algorithmVersion,
            String requestPayload,
            Instant createdAt
    ) {
        return new TaskPredictionInputSnapshot(
                predictionId, taskId, userId, personaGenerationId,
                personaVersionId, providerPersonaId, taskEndsAt,
                requestSchemaVersion, algorithmVersion, requestPayload,
                fingerprint(requestPayload), createdAt);
    }

    public static String fingerprint(String payload) {
        Objects.requireNonNull(payload, "payload");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value;
    }
}
