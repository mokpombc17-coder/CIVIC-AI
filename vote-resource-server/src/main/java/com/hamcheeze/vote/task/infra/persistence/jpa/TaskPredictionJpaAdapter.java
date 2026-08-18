package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionPersistenceException;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionPersistenceException.ErrorCode;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.task.TaskOptionKind;
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
            persistCandidates(prediction);
            entityManager.flush();
            return TaskPredictionJpaMapper.toDomain(entityManager, entity);
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
        if (!prediction.candidates().isEmpty()
                && candidateCount(prediction.id().value()) == 0) {
            persistCandidates(prediction);
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
        List<TaskPredictionJpaEntity> matches = entityManager.createQuery(
                        """
                        SELECT prediction
                        FROM TaskPredictionJpaEntity prediction
                        WHERE prediction.status = :pending
                           OR (prediction.status = :retryWait
                               AND prediction.nextRetryAt <= :dueAt)
                        ORDER BY prediction.createdAt, prediction.id
                        """, TaskPredictionJpaEntity.class)
                .setParameter("pending", TaskPredictionStatus.PENDING)
                .setParameter("retryWait", TaskPredictionStatus.RETRY_WAIT)
                .setParameter("dueAt", dueAt)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .setMaxResults(1)
                .getResultList();
        return matches.stream().findFirst().flatMap(this::map);
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

    private void persistCandidates(TaskPrediction prediction) {
        for (TaskPredictionCandidate candidate : prediction.candidates()) {
            TaskPredictionCandidateJpaEntity candidateEntity =
                    new TaskPredictionCandidateJpaEntity(
                            prediction.taskId().value(), candidate);
            entityManager.persist(candidateEntity);
            TaskAnswerJpaCodec.EncodedAnswer encoded =
                    TaskAnswerJpaCodec.encode(candidate.answerValue());
            for (TaskOptionSelection selection : encoded.selections()) {
                entityManager.persist(
                        new TaskPredictionCandidateSelectionJpaEntity(
                                candidate.id().value(),
                                prediction.id().value(),
                                prediction.taskId().value(),
                                candidate.questionId().value(),
                                encoded.type(),
                                selection.optionId().value(),
                                optionKind(selection.optionId().value()),
                                selection.otherText()));
            }
        }
    }

    private TaskOptionKind optionKind(UUID optionId) {
        TaskOptionJpaEntity option = entityManager.find(
                TaskOptionJpaEntity.class, optionId);
        if (option == null) {
            throw new IllegalStateException(
                    "prediction selection references a missing option");
        }
        return option.kind();
    }

    private long candidateCount(UUID predictionId) {
        return entityManager.createQuery(
                        "SELECT COUNT(candidate) "
                                + "FROM TaskPredictionCandidateJpaEntity candidate "
                                + "WHERE candidate.predictionId = :predictionId",
                        Long.class)
                .setParameter("predictionId", predictionId)
                .getSingleResult();
    }

    private Optional<TaskPrediction> map(TaskPredictionJpaEntity entity) {
        return Optional.ofNullable(entity)
                .map(stored -> TaskPredictionJpaMapper.toDomain(
                        entityManager, stored));
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
