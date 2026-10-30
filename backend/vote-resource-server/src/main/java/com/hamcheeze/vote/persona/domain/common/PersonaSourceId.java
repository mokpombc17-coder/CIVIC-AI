package com.hamcheeze.vote.persona.domain.common;

import java.util.Objects;
import java.util.UUID;

public record PersonaSourceId(UUID value) {

    public PersonaSourceId {
        Objects.requireNonNull(value, "value");
    }
}
