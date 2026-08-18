package com.hamcheeze.vote.persona.domain.common;

import java.util.UUID;

public record PersonaVersionId(UUID value) {

    public PersonaVersionId {
        if (value == null) {
            throw PersonaDomainException.invariant(
                    "PERSONA_VERSION_ID_REQUIRED",
                    "personaVersionId",
                    "personaVersionId is required");
        }
    }
}
