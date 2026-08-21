package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionPersistenceException;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionPersistenceException.ErrorCode;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class TaskPredictionJpaAdapter implements TaskPredictionRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public TaskPrediction insert(TaskPrediction prediction) {
        try {
            TaskPredictionJpaEntity entity =
                    new TaskPredictionJpaEntity(prediction);
            entityManager.persist(entity);
            persistPredictedReasons(prediction);
            entityManager.flush();
            return TaskPredictionJpaMapper.toDomain(entityManager, entity);
        } catch (RuntimeException exception) {
            throw translateConstraint(exception);
        }
    }

    @Override
    @Transactional
    public boolean insertPendingIfAbsent(TaskPrediction prediction) {
        if (prediction.status() != TaskPredictionStatus.PENDING
                || prediction.attemptCount() != 0) {
            throw new IllegalArgumentException(
                    "insertPendingIfAbsent requires a new PENDING prediction");
        }
        try {
            @SuppressWarnings("unchecked")
            List<UUID> inserted = entityManager.createNativeQuery("""
                    INSERT INTO task_predictions (
                        prediction_id, row_version, user_id, task_id,
                        persona_generation_id, persona_version_id, persona_id,
                        status, candidate_policy_version, attempt_count,
                        next_retry_at, last_error_code, last_error_message,
                        created_at, started_at, completed_at,
                        active_attempt_id, processing_started_at,
                        lease_expires_at)
                    VALUES (
                        :predictionId, 0, :userId, :taskId,
                        :generationId, :versionId, :personaId,
                        'PENDING', :policyVersion, 0,
                        NULL, NULL, NULL, :createdAt, NULL, NULL,
                        NULL, NULL, NULL)
                    ON CONFLICT ON CONSTRAINT uq_task_prediction_identity
                    DO NOTHING
                    RETURNING prediction_id
                    """, UUID.class)
                    .setParameter("predictionId", prediction.id().value())
                    .setParameter("userId", prediction.userId().value())
                    .setParameter("taskId", prediction.taskId().value())
                    .setParameter("generationId",
                            prediction.personaGenerationId().value())
                    .setParameter("versionId",
                            prediction.personaVersionId().value())
                    .setParameter("personaId", prediction.personaId().value())
                    .setParameter("policyVersion",
                            prediction.candidatePolicyVersion())
                    .setParameter("createdAt", prediction.createdAt())
                    .getResultList();
            return !inserted.isEmpty();
        } catch (RuntimeException exception) {
            throw translateConstraint(exception);
        }
    }

    @Override
    @Transactional
    public TaskPrediction save(TaskPrediction prediction) {
        TaskPredictionJpaEntity entity = entityManager.find(
                TaskPredictionJpaEntity.class,
                prediction.id().value(),
                LockModeType.PESSIMISTIC_WRITE);
        if (entity == null) {
            return insert(prediction);
        }
        entity.apply(prediction);
        if (!prediction.predictedReasons().isEmpty()
                && predictedReasonCount(prediction.id().value()) == 0) {
            persistPredictedReasons(prediction);
        }
        entityManager.flush();
        return TaskPredictionJpaMapper.toDomain(entityManager, entity);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TaskPrediction> findById(
            TaskPredictionId predictionId
    ) {
        return map(entityManager.find(
                TaskPredictionJpaEntity.class, predictionId.value()));
    }

    @Override
    @Transactional
    public Optional<TaskPrediction> findByIdForUpdate(
            TaskPredictionId predictionId
    ) {
        return map(entityManager.find(
                TaskPredictionJpaEntity.class,
                predictionId.value(),
                LockModeType.PESSIMISTIC_WRITE));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TaskPrediction> findByIdentity(
            TaskUserId userId,
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId
    ) {
        return queryByIdentity(userId, taskId, personaGenerationId)
                .getResultList().stream().findFirst().flatMap(this::map);
    }

    @Override
    @Transactional
    public Optional<TaskPrediction> findByIdentityForUpdate(
            TaskUserId userId,
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId
    ) {
        return queryByIdentity(userId, taskId, personaGenerationId)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .getResultList().stream().findFirst().flatMap(this::map);
    }

    @Override
    @Transactional
    public Optional<TaskPrediction> findNextDispatchableForUpdate(
            Instant dueAt
    ) {
        return lockNext("""
                SELECT prediction.prediction_id
                FROM task_predictions prediction
                WHERE (prediction.status = 'PENDING'
                    OR (prediction.status = 'RETRY_WAIT'
                        AND prediction.next_retry_at <= :now))
                  AND EXISTS (
                    SELECT 1
                    FROM task_prediction_inputs input
                    WHERE input.prediction_id = prediction.prediction_id)
                ORDER BY COALESCE(prediction.next_retry_at,
                                  prediction.created_at),
                         prediction.created_at,
                         prediction.prediction_id
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """, dueAt);
    }

    @Override
    @Transactional
    public Optional<TaskPrediction> findNextExpiredLeaseForUpdate(
            Instant now
    ) {
        return lockNext("""
                SELECT prediction.prediction_id
                FROM task_predictions prediction
                WHERE prediction.status = 'PROCESSING'
                  AND prediction.lease_expires_at <= :now
                ORDER BY prediction.lease_expires_at,
                         prediction.prediction_id
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """, now);
    }

    @Override
    @Transactional
    public Optional<TaskPrediction> findNextDeadlineExpiredForUpdate(
            Instant now
    ) {
        return lockNext("""
                SELECT prediction.prediction_id
                FROM task_predictions prediction
                JOIN tasks task ON task.task_id = prediction.task_id
                WHERE prediction.status IN (
                    'PENDING', 'PROCESSING', 'RETRY_WAIT')
                  AND (task.status = 'CLOSED'
                       OR task.scheduled_close_at <= :now)
                ORDER BY CASE WHEN task.status = 'CLOSED' THEN 0 ELSE 1 END,
                         task.scheduled_close_at,
                         prediction.created_at,
                         prediction.prediction_id
                FOR UPDATE OF task, prediction SKIP LOCKED
                LIMIT 1
                """, now);
    }

    @Override
    @Transactional
    public TaskPredictionAttempt saveAttempt(TaskPredictionAttempt attempt) {
        TaskPredictionAttemptJpaEntity entity = entityManager.find(
                TaskPredictionAttemptJpaEntity.class,
                attempt.id().value(),
                LockModeType.PESSIMISTIC_WRITE);
        if (entity == null) {
            entity = new TaskPredictionAttemptJpaEntity(attempt);
            entityManager.persist(entity);
        } else {
            if (entity.outcome().completed()) {
                throw new IllegalStateException(
                        "completed task prediction attempt is immutable");
            }
            entity.apply(attempt);
        }
        entityManager.flush();
        return TaskPredictionJpaMapper.toDomain(entity);
    }

    @Override
    @Transactional
    public boolean markLateCompletionObserved(
            TaskPredictionAttemptId attemptId,
            Instant observedAt
    ) {
        TaskPredictionAttemptJpaEntity entity = entityManager.find(
                TaskPredictionAttemptJpaEntity.class,
                attemptId.value(), LockModeType.PESSIMISTIC_WRITE);
        if (entity == null) {
            throw new IllegalStateException(
                    "task prediction attempt not found");
        }
        boolean firstObservation = entity.lateCompletionObservedAt() == null;
        entity.markLateCompletionObserved(observedAt);
        entityManager.flush();
        return firstObservation;
    }

    @Override
    @Transactional(readOnly = true)
    public List<TaskPredictionAttempt> findAttempts(
            TaskPredictionId predictionId
    ) {
        return entityManager.createQuery(
                        """
                        SELECT attempt
                        FROM TaskPredictionAttemptJpaEntity attempt
                        WHERE attempt.predictionId = :predictionId
                        ORDER BY attempt.attemptNumber
                        """, TaskPredictionAttemptJpaEntity.class)
                .setParameter("predictionId", predictionId.value())
                .getResultList().stream()
                .map(TaskPredictionJpaMapper::toDomain)
                .toList();
    }

    private void persistPredictedReasons(TaskPrediction prediction) {
        for (TaskPredictedReason predictedReason
                : prediction.predictedReasons()) {
            entityManager.persist(
                    new TaskPredictedReasonJpaEntity(predictedReason));
        }
    }

    private long predictedReasonCount(UUID predictionId) {
        return entityManager.createQuery(
                        "SELECT COUNT(reason) "
                                + "FROM TaskPredictedReasonJpaEntity reason "
                                + "WHERE reason.predictionId = :predictionId",
                        Long.class)
                .setParameter("predictionId", predictionId)
                .getSingleResult();
    }

    private Optional<TaskPrediction> map(TaskPredictionJpaEntity entity) {
        return Optional.ofNullable(entity)
                .map(stored -> TaskPredictionJpaMapper.toDomain(
                        entityManager, stored));
    }

    @SuppressWarnings("unchecked")
    private Optional<TaskPrediction> lockNext(String sql, Instant now) {
        List<UUID> ids = entityManager.createNativeQuery(sql, UUID.class)
                .setParameter("now", now)
                .getResultList();
        if (ids.isEmpty()) {
            return Optional.empty();
        }
        return map(entityManager.find(
                TaskPredictionJpaEntity.class, ids.getFirst()));
    }

    private jakarta.persistence.TypedQuery<TaskPredictionJpaEntity>
    queryByIdentity(
            TaskUserId userId,
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId
    ) {
        return entityManager.createQuery(
                        """
                        SELECT prediction
                        FROM TaskPredictionJpaEntity prediction
                        WHERE prediction.userId = :userId
                          AND prediction.taskId = :taskId
                          AND prediction.personaGenerationId = :generationId
                        """, TaskPredictionJpaEntity.class)
                .setParameter("userId", userId.value())
                .setParameter("taskId", taskId.value())
                .setParameter("generationId", personaGenerationId.value())
                .setMaxResults(1);
    }

    private static RuntimeException translateConstraint(
            RuntimeException exception
    ) {
        StringBuilder messages = new StringBuilder();
        Throwable cause = exception;
        while (cause != null) {
            messages.append(' ').append(cause.getMessage());
            cause = cause.getCause();
        }
        ErrorCode code = messages.toString().contains(
                "uq_task_prediction_identity")
                ? ErrorCode.IDENTITY_ALREADY_EXISTS
                : ErrorCode.INTEGRITY_CONSTRAINT_VIOLATION;
        return new TaskPredictionPersistenceException(
                code,
                code == ErrorCode.IDENTITY_ALREADY_EXISTS
                        ? "task prediction identity already exists"
                        : "task prediction integrity constraint violated",
                exception);
    }
}
