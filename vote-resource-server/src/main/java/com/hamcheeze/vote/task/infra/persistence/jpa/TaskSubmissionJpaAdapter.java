package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionPersistenceException;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionPersistenceException.ErrorCode;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Repository
public class TaskSubmissionJpaAdapter implements TaskSubmissionRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public TaskSubmission insert(TaskSubmission submission) {
        if (entityManager.find(
                TaskSubmissionJpaEntity.class,
                submission.id().value()) != null) {
            throw new UnsupportedOperationException(
                    "final task submission is immutable: " + submission.id());
        }
        try {
            TaskSubmissionJpaEntity entity =
                    new TaskSubmissionJpaEntity(submission);
            entityManager.persist(entity);
            entityManager.flush();
            return TaskSubmissionJpaMapper.toDomain(entityManager, entity);
        } catch (RuntimeException exception) {
            throw translateConstraint(exception);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TaskSubmission> findById(
            TaskSubmissionId submissionId
    ) {
        return map(entityManager.find(
                TaskSubmissionJpaEntity.class, submissionId.value()));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TaskSubmission> findByUserAndTask(
            TaskUserId userId,
            TaskId taskId
    ) {
        return entityManager.createQuery(
                        """
                        SELECT submission
                        FROM TaskSubmissionJpaEntity submission
                        WHERE submission.userId = :userId
                          AND submission.taskId = :taskId
                        """, TaskSubmissionJpaEntity.class)
                .setParameter("userId", userId.value())
                .setParameter("taskId", taskId.value())
                .setMaxResults(1)
                .getResultList().stream()
                .findFirst()
                .flatMap(this::map);
    }

    @Override
    @Transactional(readOnly = true)
    public long countByTaskId(TaskId taskId) {
        return entityManager.createQuery(
                        """
                        SELECT count(submission)
                        FROM TaskSubmissionJpaEntity submission
                        WHERE submission.taskId = :taskId
                        """, Long.class)
                .setParameter("taskId", taskId.value())
                .getSingleResult();
    }

    private Optional<TaskSubmission> map(TaskSubmissionJpaEntity entity) {
        return Optional.ofNullable(entity)
                .map(stored -> TaskSubmissionJpaMapper.toDomain(
                        entityManager, stored));
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
                "uq_task_submission_user_task")
                ? ErrorCode.USER_ALREADY_SUBMITTED
                : ErrorCode.INTEGRITY_CONSTRAINT_VIOLATION;
        return new TaskSubmissionPersistenceException(
                code,
                code == ErrorCode.USER_ALREADY_SUBMITTED
                        ? "user already submitted this task"
                        : "task submission integrity constraint violated",
                exception);
    }
}
