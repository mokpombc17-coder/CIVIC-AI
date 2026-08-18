package com.hamcheeze.vote.shared.integration.outbox;

import java.util.Optional;
import java.util.UUID;

public interface IntegrationOutboxRepository {

    IntegrationOutboxMessage insert(IntegrationOutboxMessage message);

    Optional<IntegrationOutboxMessage> findByEventId(UUID eventId);
}
