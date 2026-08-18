package com.hamcheeze.vote.shared.integration;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record IntegrationEventEnvelope(
        UUID eventId,
        String eventType,
        int schemaVersion,
        Instant occurredAt,
        String aggregateType,
        UUID aggregateId,
        String payload
) {

    public IntegrationEventEnvelope {
        Objects.requireNonNull(eventId, "eventId");
        eventType = requireText(eventType, "eventType");
        if (schemaVersion < 1) {
            throw new IllegalArgumentException(
                    "schemaVersion must be positive");
        }
        Objects.requireNonNull(occurredAt, "occurredAt");
        aggregateType = requireText(aggregateType, "aggregateType");
        Objects.requireNonNull(aggregateId, "aggregateId");
        Objects.requireNonNull(payload, "payload");
        if (payload.isBlank()) {
            throw new IllegalArgumentException("payload must not be blank");
        }
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
