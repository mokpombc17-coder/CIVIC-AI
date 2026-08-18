package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;

import java.util.Objects;

public record PersonaCreationCommand(
        PersonaGenerationId generationId,
        int schemaVersion,
        PersonaSurveySource source
) {

    public static final int CURRENT_SCHEMA_VERSION = 2;

    public PersonaCreationCommand {
        Objects.requireNonNull(generationId, "generationId");
        if (schemaVersion < 1) {
            throw new IllegalArgumentException(
                    "schemaVersion must be positive");
        }
        Objects.requireNonNull(source, "source");
    }
}
