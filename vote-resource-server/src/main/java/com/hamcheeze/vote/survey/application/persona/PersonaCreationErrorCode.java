package com.hamcheeze.vote.survey.application.persona;

public enum PersonaCreationErrorCode {
    IDEMPOTENCY_CONFLICT,
    GENERATION_ID_MISMATCH,
    INVALID_RESPONSE,
    CLIENT_ERROR,
    RATE_LIMITED,
    SERVER_ERROR,
    TIMEOUT,
    NETWORK_ERROR,
    PERSONA_ID_ALREADY_LINKED,
    SOURCE_UNAVAILABLE,
    INTERNAL_ERROR
}
