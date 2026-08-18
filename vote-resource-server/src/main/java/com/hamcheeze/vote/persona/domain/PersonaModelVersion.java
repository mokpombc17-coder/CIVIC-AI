package com.hamcheeze.vote.persona.domain;

import com.hamcheeze.vote.persona.domain.common.PersonaDomainException;

public record PersonaModelVersion(String value) {

    public static final int MAX_LENGTH = 128;

    public PersonaModelVersion {
        if (value == null || value.isBlank()) {
            throw PersonaDomainException.invariant(
                    "PERSONA_MODEL_VERSION_REQUIRED",
                    "modelVersion",
                    "modelVersion must not be blank");
        }
        if (!value.equals(value.strip())) {
            throw PersonaDomainException.invariant(
                    "PERSONA_MODEL_VERSION_WHITESPACE",
                    "modelVersion",
                    "modelVersion must not contain surrounding whitespace");
        }
        if (value.length() > MAX_LENGTH) {
            throw PersonaDomainException.invariant(
                    "PERSONA_MODEL_VERSION_TOO_LONG",
                    "modelVersion",
                    "modelVersion must not exceed " + MAX_LENGTH
                            + " characters");
        }
    }
}
