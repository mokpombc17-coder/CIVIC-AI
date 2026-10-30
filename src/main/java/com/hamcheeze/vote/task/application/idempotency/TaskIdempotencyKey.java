package com.hamcheeze.vote.task.application.idempotency;

import java.util.Objects;
import java.util.UUID;

public record TaskIdempotencyKey(UUID value) {

    public TaskIdempotencyKey {
        Objects.requireNonNull(value, "value");
    }

    public static TaskIdempotencyKey parse(String value) {
        try {
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException("missing UUID");
            }
            UUID parsed = UUID.fromString(value);
            if (!parsed.toString().equalsIgnoreCase(value)) {
                throw new IllegalArgumentException("non-canonical UUID");
            }
            return new TaskIdempotencyKey(parsed);
        } catch (IllegalArgumentException exception) {
            throw TaskIdempotencyException.invalidKey(exception);
        }
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
