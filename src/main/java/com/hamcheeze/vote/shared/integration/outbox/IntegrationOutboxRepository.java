package com.hamcheeze.vote.shared.integration.outbox;

import java.util.Optional;
import java.util.UUID;
import java.time.Instant;

public interface IntegrationOutboxRepository {

    IntegrationOutboxMessage insert(IntegrationOutboxMessage message);

    IntegrationOutboxMessage save(IntegrationOutboxMessage message);

    Optional<IntegrationOutboxMessage> findByEventId(UUID eventId);

    Optional<IntegrationOutboxMessage> findByEventIdForUpdate(UUID eventId);

    Optional<IntegrationOutboxMessage> findNextReadyForUpdate(Instant readyAt);
}
