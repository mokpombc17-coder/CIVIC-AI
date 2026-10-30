package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;

import java.util.Objects;

public record PersonaCreationCommand(
        PersonaGenerationId generationId,
        int schemaVersion,
        String requestPayload,
        String requestFingerprint
) {

    public static final int CURRENT_SCHEMA_VERSION = 3;

    public PersonaCreationCommand {
        Objects.requireNonNull(generationId, "generationId");
        if (schemaVersion < 1) {
            throw new IllegalArgumentException(
                    "schemaVersion must be positive");
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
        if (!PersonaGenerationInputSnapshot.fingerprint(requestPayload)
                .equals(requestFingerprint)) {
            throw new PersonaGenerationInputException(
                    PersonaGenerationInputException.ErrorCode
                            .FINGERPRINT_MISMATCH,
                    "Persona creation command fingerprint does not match payload");
        }
    }
}
