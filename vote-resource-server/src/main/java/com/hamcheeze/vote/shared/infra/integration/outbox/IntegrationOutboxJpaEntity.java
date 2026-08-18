package com.hamcheeze.vote.shared.infra.integration.outbox;

import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "integration_outbox")
class IntegrationOutboxJpaEntity {

    @Id
    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "event_type", nullable = false, length = 100)
    private String eventType;

    @Column(name = "schema_version", nullable = false)
    private int schemaVersion;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "aggregate_type", nullable = false, length = 100)
    private String aggregateType;

    @Column(name = "aggregate_id", nullable = false)
    private UUID aggregateId;

    @Column(name = "payload", nullable = false, columnDefinition = "jsonb")
    @ColumnTransformer(write = "CAST(? AS jsonb)")
    private String payload;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at")
    private Instant nextAttemptAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "last_error", length = 1000)
    private String lastError;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected IntegrationOutboxJpaEntity() {
    }

    IntegrationOutboxJpaEntity(IntegrationOutboxMessage message) {
        eventId = message.event().eventId();
        eventType = message.event().eventType();
        schemaVersion = message.event().schemaVersion();
        occurredAt = message.event().occurredAt();
        aggregateType = message.event().aggregateType();
        aggregateId = message.event().aggregateId();
        payload = message.event().payload();
        attemptCount = message.attemptCount();
        nextAttemptAt = message.nextAttemptAt();
        publishedAt = message.publishedAt();
        lastError = message.lastError();
        createdAt = message.createdAt();
    }

    UUID eventId() {
        return eventId;
    }

    String eventType() {
        return eventType;
    }

    int schemaVersion() {
        return schemaVersion;
    }

    Instant occurredAt() {
        return occurredAt;
    }

    String aggregateType() {
        return aggregateType;
    }

    UUID aggregateId() {
        return aggregateId;
    }

    String payload() {
        return payload;
    }

    int attemptCount() {
        return attemptCount;
    }

    Instant nextAttemptAt() {
        return nextAttemptAt;
    }

    Instant publishedAt() {
        return publishedAt;
    }

    String lastError() {
        return lastError;
    }

    Instant createdAt() {
        return createdAt;
    }
}
