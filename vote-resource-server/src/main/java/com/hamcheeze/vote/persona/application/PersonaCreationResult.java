package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.PersonaId;

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
