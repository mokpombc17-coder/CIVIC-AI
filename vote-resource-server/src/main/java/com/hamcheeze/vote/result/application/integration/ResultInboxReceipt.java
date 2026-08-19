package com.hamcheeze.vote.result.application.integration;

import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;

public record ResultInboxReceipt(
        String consumerName,
        UUID eventId,
        String eventType,
        int schemaVersion,
        Instant occurredAt,
        String aggregateType,
        UUID aggregateId,
        String payload,
        Instant processedAt
) {

    public ResultInboxReceipt {
        consumerName = requireText(consumerName, "consumerName");
        Objects.requireNonNull(eventId, "eventId");
        eventType = requireText(eventType, "eventType");
        if (schemaVersion < 1) {
            throw new IllegalArgumentException(
                    "schemaVersion must be positive");
        }
        occurredAt = requireMicrosecondInstant(occurredAt, "occurredAt");
        aggregateType = requireText(aggregateType, "aggregateType");
        Objects.requireNonNull(aggregateId, "aggregateId");
        payload = requirePayload(payload);
        processedAt = requireMicrosecondInstant(
                processedAt, "processedAt");
    }

    public static ResultInboxReceipt from(
            String consumerName,
            IntegrationEventEnvelope event,
            Instant processedAt
    ) {
        Objects.requireNonNull(event, "event");
        return new ResultInboxReceipt(
                consumerName,
                event.eventId(),
                event.eventType(),
                event.schemaVersion(),
                event.occurredAt(),
                event.aggregateType(),
                event.aggregateId(),
                event.payload(),
                processedAt);
    }

    public boolean hasSameEvent(IntegrationEventEnvelope event) {
        Objects.requireNonNull(event, "event");
        return eventId.equals(event.eventId())
                && eventType.equals(event.eventType())
                && schemaVersion == event.schemaVersion()
                && occurredAt.equals(event.occurredAt().truncatedTo(
                        ChronoUnit.MICROS))
                && aggregateType.equals(event.aggregateType())
                && aggregateId.equals(event.aggregateId())
                && payload.equals(event.payload());
    }

    private static Instant requireMicrosecondInstant(
            Instant value,
            String field
    ) {
        Objects.requireNonNull(value, field);
        return value.truncatedTo(ChronoUnit.MICROS);
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

    private static String requirePayload(String value) {
        Objects.requireNonNull(value, "payload");
        if (value.isBlank()) {
            throw new IllegalArgumentException("payload must not be blank");
        }
        return value;
    }
}
