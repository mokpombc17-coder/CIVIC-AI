package com.hamcheeze.vote.persona.domain.common;

import java.util.Objects;

public record PersonaViolation(String code, String field, String message) {

    public PersonaViolation {
        code = requireText(code, "code");
        field = requireText(field, "field");
        message = requireText(message, "message");
    }

    private static String requireText(String value, String fieldName) {
        Objects.requireNonNull(value, fieldName);
        if (value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " must not be blank");
        }
        return value;
    }
}
