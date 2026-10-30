package com.hamcheeze.vote.shared.infra.integration.outbox;

import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
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
    @Transactional
    public IntegrationOutboxMessage save(IntegrationOutboxMessage message) {
        IntegrationOutboxJpaEntity entity = entityManager.find(
                IntegrationOutboxJpaEntity.class,
                message.event().eventId(),
                LockModeType.PESSIMISTIC_WRITE);
        if (entity == null) {
            throw new IllegalStateException("outbox event not found");
        }
        entity.updateFrom(message);
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

    @Override
    @Transactional
    public Optional<IntegrationOutboxMessage> findByEventIdForUpdate(
            UUID eventId
    ) {
        return Optional.ofNullable(entityManager.find(
                        IntegrationOutboxJpaEntity.class,
                        eventId,
                        LockModeType.PESSIMISTIC_WRITE))
                .map(IntegrationOutboxJpaMapper::toDomain);
    }

    @Override
    @Transactional
    public Optional<IntegrationOutboxMessage> findNextReadyForUpdate(
            Instant readyAt
    ) {
        return entityManager.createQuery(
                        """
                        select event
                        from IntegrationOutboxJpaEntity event
                        where event.publishedAt is null
                          and event.deadLetteredAt is null
                          and event.nextAttemptAt is not null
                          and event.nextAttemptAt <= :readyAt
                        order by event.nextAttemptAt,
                                 event.occurredAt,
                                 event.eventId
                        """,
                        IntegrationOutboxJpaEntity.class)
                .setParameter("readyAt", readyAt)
                .setMaxResults(1)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .getResultList().stream()
                .findFirst()
                .map(IntegrationOutboxJpaMapper::toDomain);
    }
}
