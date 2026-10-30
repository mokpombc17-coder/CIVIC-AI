package com.hamcheeze.vote.persona.application.integration;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record PersonaInboxReceipt(
        String consumerName,
        UUID eventId,
        String eventType,
        Instant processedAt
) {

    public PersonaInboxReceipt {
        consumerName = requireText(consumerName, "consumerName");
        Objects.requireNonNull(eventId, "eventId");
        eventType = requireText(eventType, "eventType");
        Objects.requireNonNull(processedAt, "processedAt");
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        if (value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        if (!value.equals(value.strip())) {
            throw new IllegalArgumentException(
                    field + " must not contain surrounding whitespace");
        }
        return value;
    }
}
