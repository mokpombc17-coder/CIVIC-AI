package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;

public record PersonaGenerationInputSnapshot(
        PersonaGenerationId generationId,
        PersonaSourceId sourceId,
        PersonaUserId userId,
        int requestSchemaVersion,
        String requestPayload,
        String requestFingerprint,
        Instant createdAt
) {

    public PersonaGenerationInputSnapshot {
        Objects.requireNonNull(generationId, "generationId");
        Objects.requireNonNull(sourceId, "sourceId");
        Objects.requireNonNull(userId, "userId");
        if (requestSchemaVersion < 1) {
            throw new IllegalArgumentException(
                    "requestSchemaVersion must be positive");
        }
        if (requestPayload == null || requestPayload.isBlank()) {
            throw new IllegalArgumentException(
                    "requestPayload must not be blank");
        }
        if (requestFingerprint == null
                || !requestFingerprint.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException(
                    "requestFingerprint must be a lowercase SHA-256 hash");
        }
        Objects.requireNonNull(createdAt, "createdAt");
        String actual = fingerprint(requestPayload);
        if (!actual.equals(requestFingerprint)) {
            throw new PersonaGenerationInputException(
                    PersonaGenerationInputException.ErrorCode
                            .FINGERPRINT_MISMATCH,
                    "Persona generation input fingerprint does not match payload");
        }
    }

    public static PersonaGenerationInputSnapshot create(
            PersonaGenerationId generationId,
            PersonaSourceId sourceId,
            PersonaUserId userId,
            int requestSchemaVersion,
            String requestPayload,
            Instant createdAt
    ) {
        return new PersonaGenerationInputSnapshot(
                generationId,
                sourceId,
                userId,
                requestSchemaVersion,
                requestPayload,
                fingerprint(requestPayload),
                createdAt);
    }

    public static String fingerprint(String requestPayload) {
        Objects.requireNonNull(requestPayload, "requestPayload");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(requestPayload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
