package com.hamcheeze.vote.survey.application.idempotency;

import java.util.Objects;
import java.util.UUID;

public record SurveyIdempotencyKey(UUID value) {

    public SurveyIdempotencyKey {
        Objects.requireNonNull(value, "value");
    }

    public static SurveyIdempotencyKey parse(String value) {
        try {
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException("missing UUID");
            }
            UUID parsed = UUID.fromString(value);
            if (!parsed.toString().equalsIgnoreCase(value)) {
                throw new IllegalArgumentException("non-canonical UUID");
            }
            return new SurveyIdempotencyKey(parsed);
        } catch (IllegalArgumentException exception) {
            throw SurveyIdempotencyException.invalidKey(exception);
        }
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
