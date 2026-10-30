package com.hamcheeze.vote.persona.domain.common;

import java.util.UUID;

public record PersonaGenerationId(UUID value) {

    public PersonaGenerationId {
        if (value == null) {
            throw PersonaDomainException.invariant(
                "PERSONA_GENERATION_ID_REQUIRED",
                "generationId",
                "generationId is required");
        }
    }
}
