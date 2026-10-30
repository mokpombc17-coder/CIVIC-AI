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
        Instant deadLetteredAt,
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
        if (publishedAt == null
                && deadLetteredAt == null
                && nextAttemptAt == null) {
            throw new IllegalArgumentException(
                    "unpublished event requires nextAttemptAt");
        }
        if (publishedAt != null) {
            if (publishedAt.isBefore(event.occurredAt())) {
                throw new IllegalArgumentException(
                        "publishedAt must not precede occurredAt");
            }
            if (deadLetteredAt != null
                    || nextAttemptAt != null
                    || lastError != null) {
                throw new IllegalArgumentException(
                        "published event cannot retain retry state");
            }
        }
        if (deadLetteredAt != null) {
            if (deadLetteredAt.isBefore(event.occurredAt())) {
                throw new IllegalArgumentException(
                        "deadLetteredAt must not precede occurredAt");
            }
            if (publishedAt != null
                    || nextAttemptAt != null
                    || lastError == null) {
                throw new IllegalArgumentException(
                        "dead letter event requires only terminal error state");
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
                event, 0, createdAt, null, null, null, createdAt);
    }

    public IntegrationOutboxMessage markPublished(Instant publishedAt) {
        requirePending();
        Objects.requireNonNull(publishedAt, "publishedAt");
        return new IntegrationOutboxMessage(
                event,
                attemptCount,
                null,
                publishedAt,
                null,
                null,
                createdAt);
    }

    public IntegrationOutboxMessage recordFailure(
            String error,
            Instant failedAt,
            Instant retryAt
    ) {
        requirePending();
        Objects.requireNonNull(failedAt, "failedAt");
        if (retryAt != null && retryAt.isBefore(failedAt)) {
            throw new IllegalArgumentException(
                    "retryAt must not precede failedAt");
        }
        return new IntegrationOutboxMessage(
                event,
                attemptCount + 1,
                retryAt,
                null,
                retryAt == null ? failedAt : null,
                requireError(error),
                createdAt);
    }

    public boolean published() {
        return publishedAt != null;
    }

    public boolean deadLettered() {
        return deadLetteredAt != null;
    }

    public Optional<Instant> optionalNextAttemptAt() {
        return Optional.ofNullable(nextAttemptAt);
    }

    public Optional<Instant> optionalPublishedAt() {
        return Optional.ofNullable(publishedAt);
    }

    public Optional<Instant> optionalDeadLetteredAt() {
        return Optional.ofNullable(deadLetteredAt);
    }

    public Optional<String> optionalLastError() {
        return Optional.ofNullable(lastError);
    }

    private void requirePending() {
        if (published() || deadLettered()) {
            throw new IllegalStateException(
                    "terminal outbox event cannot transition again");
        }
    }

    private static String requireError(String error) {
        Objects.requireNonNull(error, "error");
        if (error.isBlank()) {
            throw new IllegalArgumentException("error must not be blank");
        }
        return error;
    }
}
