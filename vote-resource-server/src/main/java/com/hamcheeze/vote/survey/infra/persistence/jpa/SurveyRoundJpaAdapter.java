package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransition;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class SurveyRoundJpaAdapter implements SurveyRoundRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public SurveyRound save(SurveyRound round) {
        UUID id = round.id().value();
        SurveyRoundJpaEntity stored = entityManager.find(
                SurveyRoundJpaEntity.class,
                id);
        if (stored == null) {
            if (round.rowVersion() != 0) {
                throw stale(round);
            }
            entityManager.persist(new SurveyRoundJpaEntity(round));
        } else {
            if (stored.rowVersion() != round.rowVersion()) {
                throw stale(round);
            }
            if (stored.status() == SurveyRoundStatus.CLOSED
                    || stored.status() == SurveyRoundStatus.CANCELED) {
                throw new UnsupportedOperationException(
                        "terminal survey round is immutable: " + id);
            }
            stored.apply(round);
        }
        entityManager.flush();
        return findById(round.id()).orElseThrow();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SurveyRound> findById(SurveyRoundId roundId) {
        return Optional.ofNullable(entityManager.find(
                        SurveyRoundJpaEntity.class,
                        roundId.value()))
                .map(SurveyRoundJpaMapper::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SurveyRound> findActive() {
        return findOneByStatus(SurveyRoundStatus.ACTIVE);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SurveyRound> findScheduled() {
        return findOneByStatus(SurveyRoundStatus.SCHEDULED);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SurveyRound> findScheduledDueAt(Instant dueAt) {
        return entityManager.createQuery("""
                        SELECT round
                        FROM SurveyRoundJpaEntity round
                        WHERE round.status = :status
                          AND round.scheduledAt <= :dueAt
                        ORDER BY round.scheduledAt, round.roundNumber
                        """, SurveyRoundJpaEntity.class)
                .setParameter("status", SurveyRoundStatus.SCHEDULED)
                .setParameter("dueAt", dueAt)
                .getResultList()
                .stream()
                .map(SurveyRoundJpaMapper::toDomain)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<SurveyRound> findAll() {
        return entityManager.createQuery("""
                        SELECT round
                        FROM SurveyRoundJpaEntity round
                        ORDER BY round.roundNumber DESC
                        """, SurveyRoundJpaEntity.class)
                .getResultList()
                .stream()
                .map(SurveyRoundJpaMapper::toDomain)
                .toList();
    }

    @Override
    @Transactional
    public long lockGlobalControlForUpdate() {
        SurveyRoundControlJpaEntity control = (SurveyRoundControlJpaEntity)
                entityManager.createNativeQuery("""
                                SELECT *
                                FROM survey_round_control
                                WHERE control_id = 'GLOBAL'
                                FOR UPDATE
                                """, SurveyRoundControlJpaEntity.class)
                        .getSingleResult();
        return control.rowVersion();
    }

    @Override
    @Transactional
    public Optional<SurveyRound> findByIdForShare(SurveyRoundId roundId) {
        List<SurveyRoundJpaEntity> rounds = entityManager.createNativeQuery("""
                        SELECT *
                        FROM survey_rounds
                        WHERE round_id = :roundId
                        FOR SHARE
                        """, SurveyRoundJpaEntity.class)
                .setParameter("roundId", roundId.value())
                .getResultList();
        return rounds.stream()
                .findFirst()
                .map(SurveyRoundJpaMapper::toDomain);
    }

    @Override
    @Transactional
    public List<SurveyRound> findByIdsForUpdate(
            List<SurveyRoundId> roundIds
    ) {
        if (roundIds.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = roundIds.stream()
                .map(SurveyRoundId::value)
                .distinct()
                .sorted()
                .toList();
        return entityManager.createQuery("""
                        SELECT round
                        FROM SurveyRoundJpaEntity round
                        WHERE round.id IN :ids
                        ORDER BY round.id
                        """, SurveyRoundJpaEntity.class)
                .setParameter("ids", ids)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .getResultList()
                .stream()
                .map(SurveyRoundJpaMapper::toDomain)
                .toList();
    }

    @Override
    @Transactional
    public void appendTransitions(List<SurveyRoundTransition> transitions) {
        transitions.forEach(transition -> entityManager.persist(
                new SurveyRoundTransitionJpaEntity(transition)));
        entityManager.flush();
    }

    @Override
    @Transactional(readOnly = true)
    public List<SurveyRoundTransition> findTransitions(
            SurveyRoundId roundId
    ) {
        return entityManager.createQuery("""
                        SELECT transition
                        FROM SurveyRoundTransitionJpaEntity transition
                        WHERE transition.roundId = :roundId
                        ORDER BY transition.occurredAt, transition.id
                        """, SurveyRoundTransitionJpaEntity.class)
                .setParameter("roundId", roundId.value())
                .getResultList()
                .stream()
                .map(SurveyRoundJpaMapper::toDomain)
                .toList();
    }

    private Optional<SurveyRound> findOneByStatus(SurveyRoundStatus status) {
        return entityManager.createQuery("""
                        SELECT round
                        FROM SurveyRoundJpaEntity round
                        WHERE round.status = :status
                        """, SurveyRoundJpaEntity.class)
                .setParameter("status", status)
                .getResultStream()
                .findFirst()
                .map(SurveyRoundJpaMapper::toDomain);
    }

    private static OptimisticLockingFailureException stale(
            SurveyRound round
    ) {
        return new OptimisticLockingFailureException(
                "stale survey round: " + round.id());
    }
}
