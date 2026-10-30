package com.hamcheeze.vote.persona.domain.common;

public record PersonaUserId(String value) {

    public static final int MAX_LENGTH = 255;

    public PersonaUserId {
        if (value == null || value.isBlank()) {
            throw PersonaDomainException.invariant(
                    "PERSONA_USER_ID_REQUIRED",
                    "userId",
                    "userId must not be blank");
        }
        if (!value.equals(value.strip())) {
            throw PersonaDomainException.invariant(
                    "PERSONA_USER_ID_WHITESPACE",
                    "userId",
                    "userId must not contain surrounding whitespace");
        }
        if (value.length() > MAX_LENGTH) {
            throw PersonaDomainException.invariant(
                    "PERSONA_USER_ID_TOO_LONG",
                    "userId",
                    "userId must not exceed " + MAX_LENGTH + " characters");
        }
    }
}
