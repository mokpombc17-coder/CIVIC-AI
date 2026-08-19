package com.hamcheeze.vote.persona.application;

import java.util.Objects;

public final class PersonaGenerationPersistenceException
        extends RuntimeException {

    private final ErrorCode errorCode;

    public PersonaGenerationPersistenceException(
            ErrorCode errorCode,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.errorCode = Objects.requireNonNull(errorCode, "errorCode");
    }

    public ErrorCode errorCode() {
        return errorCode;
    }

    public enum ErrorCode {
        SOURCE_ALREADY_LINKED,
        PERSONA_ID_ALREADY_LINKED,
        INTEGRITY_CONSTRAINT_VIOLATION
    }
}
