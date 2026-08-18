package com.hamcheeze.vote.shared.integration.outbox;

import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public record IntegrationOutboxMessage(
        IntegrationEventEnvelope event,
        int attemptCount,
        Instant nextAttemptAt,
        Instant publishedAt,
        String lastError,
        Instant createdAt
) {

    public IntegrationOutboxMessage {
        Objects.requireNonNull(event, "event");
        if (attemptCount < 0) {
            throw new IllegalArgumentException(
                    "attemptCount must not be negative");
        }
        Objects.requireNonNull(createdAt, "createdAt");
        if (publishedAt == null && nextAttemptAt == null) {
            throw new IllegalArgumentException(
                    "unpublished event requires nextAttemptAt");
        }
        if (publishedAt != null) {
            if (publishedAt.isBefore(event.occurredAt())) {
                throw new IllegalArgumentException(
                        "publishedAt must not precede occurredAt");
            }
            if (nextAttemptAt != null || lastError != null) {
                throw new IllegalArgumentException(
                        "published event cannot retain retry state");
            }
        }
        if (lastError != null && lastError.isBlank()) {
            throw new IllegalArgumentException(
                    "lastError must not be blank");
        }
    }

    public static IntegrationOutboxMessage pending(
            IntegrationEventEnvelope event,
            Instant createdAt
    ) {
        return new IntegrationOutboxMessage(
                event, 0, createdAt, null, null, createdAt);
    }

    public boolean published() {
        return publishedAt != null;
    }

    public Optional<Instant> optionalNextAttemptAt() {
        return Optional.ofNullable(nextAttemptAt);
    }

    public Optional<Instant> optionalPublishedAt() {
        return Optional.ofNullable(publishedAt);
    }

    public Optional<String> optionalLastError() {
        return Optional.ofNullable(lastError);
    }
}
