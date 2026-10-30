package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyKey;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyOperation;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyReceipt;
import com.hamcheeze.vote.survey.application.port.out.SurveyIdempotencyReceiptRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
public class SurveyIdempotencyJpaAdapter
        implements SurveyIdempotencyReceiptRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public Optional<SurveyIdempotencyReceipt> findByRequestForUpdate(
            SurveyUserId userId,
            SurveyIdempotencyOperation operation,
            SurveyIdempotencyKey idempotencyKey
    ) {
        List<SurveyIdempotencyJpaEntity> matches = queryByRequest(
                userId, operation, idempotencyKey)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .getResultList();
        return matches.stream()
                .findFirst()
                .map(SurveyIdempotencyJpaMapper::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SurveyIdempotencyReceipt> findByRequest(
            SurveyUserId userId,
            SurveyIdempotencyOperation operation,
            SurveyIdempotencyKey idempotencyKey
    ) {
        return queryByRequest(userId, operation, idempotencyKey)
                .getResultList().stream()
                .findFirst()
                .map(SurveyIdempotencyJpaMapper::toDomain);
    }

    @Override
    @Transactional
    public void insertProcessing(SurveyIdempotencyReceipt receipt) {
        entityManager.persist(new SurveyIdempotencyJpaEntity(receipt));
        entityManager.flush();
    }

    @Override
    @Transactional
    public void updateCompleted(SurveyIdempotencyReceipt receipt) {
        SurveyIdempotencyJpaEntity entity = entityManager.find(
                SurveyIdempotencyJpaEntity.class,
                receipt.id().value(),
                LockModeType.PESSIMISTIC_WRITE);
        if (entity == null) {
            throw new IllegalStateException(
                    "idempotency receipt disappeared during completion");
        }
        entity.completeFrom(receipt);
        entityManager.flush();
    }

    private jakarta.persistence.TypedQuery<SurveyIdempotencyJpaEntity>
    queryByRequest(
            SurveyUserId userId,
            SurveyIdempotencyOperation operation,
            SurveyIdempotencyKey idempotencyKey
    ) {
        return entityManager.createQuery("""
                        SELECT receipt
                        FROM SurveyIdempotencyJpaEntity receipt
                        WHERE receipt.userId = :userId
                          AND receipt.operation = :operation
                          AND receipt.idempotencyKey = :idempotencyKey
                        """, SurveyIdempotencyJpaEntity.class)
                .setParameter("userId", userId.value())
                .setParameter("operation", operation)
                .setParameter("idempotencyKey", idempotencyKey.value())
                .setMaxResults(1);
    }
}
