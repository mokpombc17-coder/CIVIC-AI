package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyKey;
import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionReceipt;
import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionReceiptStatus;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionReceiptRepository;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
public class TaskSubmissionReceiptJpaAdapter
        implements TaskSubmissionReceiptRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public Optional<TaskSubmissionReceipt> findByRequestForUpdate(
            TaskUserId userId,
            TaskIdempotencyKey idempotencyKey
    ) {
        List<TaskSubmissionReceiptJpaEntity> matches = queryByRequest(
                userId, idempotencyKey)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .getResultList();
        return matches.stream().findFirst()
                .map(TaskSubmissionJpaMapper::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TaskSubmissionReceipt> findByRequest(
            TaskUserId userId,
            TaskIdempotencyKey idempotencyKey
    ) {
        return queryByRequest(userId, idempotencyKey)
                .getResultList().stream().findFirst()
                .map(TaskSubmissionJpaMapper::toDomain);
    }

    @Override
    @Transactional
    public void insertProcessing(TaskSubmissionReceipt receipt) {
        entityManager.persist(new TaskSubmissionReceiptJpaEntity(receipt));
        entityManager.flush();
    }

    @Override
    @Transactional
    public void updateCompleted(TaskSubmissionReceipt receipt) {
        TaskSubmissionReceiptJpaEntity entity = entityManager.find(
                TaskSubmissionReceiptJpaEntity.class,
                receipt.id().value(),
                LockModeType.PESSIMISTIC_WRITE);
        if (entity == null) {
            throw new IllegalStateException(
                    "task submission receipt disappeared during completion");
        }
        if (entity.status() != TaskSubmissionReceiptStatus.PROCESSING) {
            throw new IllegalStateException(
                    "completed task submission receipt is immutable");
        }
        entity.completeFrom(receipt);
        entityManager.flush();
    }

    private jakarta.persistence.TypedQuery<TaskSubmissionReceiptJpaEntity>
    queryByRequest(
            TaskUserId userId,
            TaskIdempotencyKey idempotencyKey
    ) {
        return entityManager.createQuery(
                        """
                        SELECT receipt
                        FROM TaskSubmissionReceiptJpaEntity receipt
                        WHERE receipt.userId = :userId
                          AND receipt.idempotencyKey = :idempotencyKey
                        """, TaskSubmissionReceiptJpaEntity.class)
                .setParameter("userId", userId.value())
                .setParameter("idempotencyKey", idempotencyKey.value())
                .setMaxResults(1);
    }
}
