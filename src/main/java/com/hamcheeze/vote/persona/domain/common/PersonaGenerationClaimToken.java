package com.hamcheeze.vote.persona.domain.common;

import java.util.Objects;
import java.util.UUID;

public record PersonaGenerationClaimToken(UUID value) {

    public PersonaGenerationClaimToken {
        Objects.requireNonNull(value, "value");
    }
}
