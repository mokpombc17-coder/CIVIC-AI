package com.hamcheeze.vote.survey.application.persona;

import java.util.Objects;

public final class PersonaCreationException extends RuntimeException {

    private final PersonaCreationErrorCode errorCode;
    private final boolean retryable;

    public PersonaCreationException(
            PersonaCreationErrorCode errorCode,
            boolean retryable,
            String message
    ) {
        this(errorCode, retryable, message, null);
    }

    public PersonaCreationException(
            PersonaCreationErrorCode errorCode,
            boolean retryable,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.errorCode = Objects.requireNonNull(errorCode, "errorCode");
        this.retryable = retryable;
    }

    public PersonaCreationErrorCode errorCode() {
        return errorCode;
    }

    public boolean retryable() {
        return retryable;
    }
}
