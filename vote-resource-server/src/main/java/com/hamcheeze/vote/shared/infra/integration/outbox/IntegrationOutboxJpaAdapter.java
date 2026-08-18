package com.hamcheeze.vote.shared.infra.integration.outbox;

import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Repository
public class IntegrationOutboxJpaAdapter
        implements IntegrationOutboxRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public IntegrationOutboxMessage insert(IntegrationOutboxMessage message) {
        IntegrationOutboxJpaEntity entity =
                new IntegrationOutboxJpaEntity(message);
        entityManager.persist(entity);
        entityManager.flush();
        return IntegrationOutboxJpaMapper.toDomain(entity);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<IntegrationOutboxMessage> findByEventId(UUID eventId) {
        return Optional.ofNullable(entityManager.find(
                        IntegrationOutboxJpaEntity.class, eventId))
                .map(IntegrationOutboxJpaMapper::toDomain);
    }
}
