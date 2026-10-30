package com.hamcheeze.vote.persona.domain;

public record PersonaId(String value) {

    public static final int MAX_LENGTH = 512;

    public PersonaId {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    "personaId must not be blank");
        }
        if (!value.equals(value.strip())) {
            throw new IllegalArgumentException(
                    "personaId must not contain surrounding whitespace");
        }
        if (value.length() > MAX_LENGTH) {
            throw new IllegalArgumentException(
                    "personaId must not exceed " + MAX_LENGTH + " characters");
        }
    }
}
