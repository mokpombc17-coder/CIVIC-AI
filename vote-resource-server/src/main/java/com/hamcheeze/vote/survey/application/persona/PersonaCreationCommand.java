package com.hamcheeze.vote.survey.application.persona;

import com.hamcheeze.vote.survey.domain.common.PersonaGenerationId;

import java.util.Objects;

public record PersonaCreationCommand(
        PersonaGenerationId generationId,
        int schemaVersion,
        PersonaSurveySource source
) {

    public static final int CURRENT_SCHEMA_VERSION = 1;

    public PersonaCreationCommand {
        Objects.requireNonNull(generationId, "generationId");
        if (schemaVersion < 1) {
            throw new IllegalArgumentException(
                    "schemaVersion must be positive");
        }
        Objects.requireNonNull(source, "source");
    }
}
