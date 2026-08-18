package com.hamcheeze.vote.shared.infra.integration.outbox;

import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;

final class IntegrationOutboxJpaMapper {

    private IntegrationOutboxJpaMapper() {
    }

    static IntegrationOutboxMessage toDomain(
            IntegrationOutboxJpaEntity entity
    ) {
        return new IntegrationOutboxMessage(
                new IntegrationEventEnvelope(
                        entity.eventId(),
                        entity.eventType(),
                        entity.schemaVersion(),
                        entity.occurredAt(),
                        entity.aggregateType(),
                        entity.aggregateId(),
                        entity.payload()),
                entity.attemptCount(),
                entity.nextAttemptAt(),
                entity.publishedAt(),
                entity.lastError(),
                entity.createdAt());
    }
}
