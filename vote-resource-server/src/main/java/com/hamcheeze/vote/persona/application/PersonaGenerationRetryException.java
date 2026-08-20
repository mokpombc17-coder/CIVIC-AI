package com.hamcheeze.vote.persona.application;

public class PersonaGenerationRetryException extends RuntimeException {

    private final ErrorCode code;

    public PersonaGenerationRetryException(ErrorCode code, String message) {
        super(message);
        this.code = code;
    }

    public ErrorCode code() {
        return code;
    }

    public enum ErrorCode {
        PERSONA_GENERATION_NOT_FOUND,
        PERSONA_GENERATION_TERMINAL_FAILURE_REQUIRED,
        PERSONA_GENERATION_RETRY_IDEMPOTENCY_CONFLICT
    }
}
