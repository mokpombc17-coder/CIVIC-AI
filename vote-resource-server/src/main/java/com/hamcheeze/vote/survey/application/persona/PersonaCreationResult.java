package com.hamcheeze.vote.survey.application.persona;

import com.hamcheeze.vote.survey.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.survey.domain.persona.PersonaId;

import java.util.Objects;

public record PersonaCreationResult(
        PersonaGenerationId generationId,
        PersonaId personaId
) {

    public PersonaCreationResult {
        Objects.requireNonNull(generationId, "generationId");
        Objects.requireNonNull(personaId, "personaId");
    }
}
