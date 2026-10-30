package com.hamcheeze.vote.persona.application;

import java.util.Objects;

public final class PersonaGenerationInputException extends RuntimeException {

    private final ErrorCode code;

    public PersonaGenerationInputException(ErrorCode code, String message) {
        super(message);
        this.code = Objects.requireNonNull(code, "code");
    }

    public PersonaGenerationInputException(
            ErrorCode code,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "code");
    }

    public ErrorCode code() {
        return code;
    }

    public enum ErrorCode {
        INPUT_UNAVAILABLE,
        FINGERPRINT_MISMATCH,
        INTEGRITY_ERROR
    }
}
