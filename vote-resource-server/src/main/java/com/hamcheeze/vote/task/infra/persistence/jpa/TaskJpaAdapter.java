package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;

@Repository
public class TaskJpaAdapter implements TaskRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public Task save(Task task) {
        UUID taskId = task.id().value();
        TaskJpaEntity stored = entityManager.find(
                TaskJpaEntity.class, taskId, LockModeType.PESSIMISTIC_WRITE);
        if (stored == null) {
            stored = new TaskJpaEntity(task);
            entityManager.persist(stored);
            persistContent(task);
        } else {
            boolean contentMutable = stored.status() == TaskStatus.DRAFT;
            if (contentMutable) {
                deleteContent(taskId);
                entityManager.clear();
                stored = entityManager.find(
                        TaskJpaEntity.class,
                        taskId,
                        LockModeType.PESSIMISTIC_WRITE);
                persistContent(task);
            } else if (questionCount(taskId) == 0) {
                persistContent(task);
            }
            stored.apply(task);
        }
        entityManager.flush();
        return TaskJpaMapper.toDomain(entityManager, stored);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Task> findById(TaskId taskId) {
        TaskJpaEntity entity = entityManager.find(
                TaskJpaEntity.class, taskId.value());
        return Optional.ofNullable(entity)
                .map(stored -> TaskJpaMapper.toDomain(entityManager, stored));
    }

    @Override
    @Transactional
    public Optional<Task> findByIdForUpdate(TaskId taskId) {
        TaskJpaEntity entity = entityManager.find(
                TaskJpaEntity.class,
                taskId.value(),
                LockModeType.PESSIMISTIC_WRITE);
        return Optional.ofNullable(entity)
                .map(stored -> TaskJpaMapper.toDomain(entityManager, stored));
    }

    @Override
    @Transactional(readOnly = true)
    public List<Task> findAll() {
        return entityManager.createQuery(
                        """
                        SELECT task
                        FROM TaskJpaEntity task
                        ORDER BY task.createdAt DESC, task.id
                        """, TaskJpaEntity.class)
                .getResultList().stream()
                .map(entity -> TaskJpaMapper.toDomain(entityManager, entity))
                .toList();
    }

    @Override
    @Transactional
    public Optional<Task> findNextLifecycleCandidateForUpdate(
            Instant dueAt
    ) {
        @SuppressWarnings("unchecked")
        List<UUID> taskIds = entityManager.createNativeQuery("""
                        SELECT task_id
                        FROM tasks
                        WHERE (status = 'SCHEDULED'
                                AND scheduled_open_at <= :dueAt)
                           OR (status = 'OPEN'
                                AND scheduled_close_at <= :dueAt)
                        ORDER BY CASE
                            WHEN status = 'SCHEDULED'
                                THEN scheduled_open_at
                            ELSE scheduled_close_at
                        END,
                        task_id
                        FOR UPDATE SKIP LOCKED
                        LIMIT 1
                        """, UUID.class)
                .setParameter("dueAt", dueAt)
                .getResultList();
        if (taskIds.isEmpty()) {
            return Optional.empty();
        }
        TaskJpaEntity entity = entityManager.find(
                TaskJpaEntity.class, taskIds.getFirst());
        return Optional.ofNullable(entity)
                .map(stored -> TaskJpaMapper.toDomain(entityManager, stored));
    }

    @Override
    @Transactional
    public void appendLifecycleHistory(
            List<TaskLifecycleHistory> histories
    ) {
        histories.forEach(history -> entityManager.persist(
                new TaskLifecycleHistoryJpaEntity(history)));
        entityManager.flush();
    }

    @Override
    @Transactional(readOnly = true)
    public List<TaskLifecycleHistory> findLifecycleHistory(TaskId taskId) {
        return entityManager.createQuery(
                        """
                        SELECT history
                        FROM TaskLifecycleHistoryJpaEntity history
                        WHERE history.taskId = :taskId
                        ORDER BY history.occurredAt, history.id
                        """, TaskLifecycleHistoryJpaEntity.class)
                .setParameter("taskId", taskId.value())
                .getResultList().stream()
                .map(TaskJpaMapper::toDomain)
                .toList();
    }

    private void deleteContent(UUID taskId) {
        entityManager.createQuery(
                        "DELETE FROM TaskOptionJpaEntity option "
                                + "WHERE option.taskId = :taskId")
                .setParameter("taskId", taskId)
                .executeUpdate();
        entityManager.createQuery(
                        "DELETE FROM TaskQuestionJpaEntity question "
                                + "WHERE question.taskId = :taskId")
                .setParameter("taskId", taskId)
                .executeUpdate();
        entityManager.flush();
    }

    private void persistContent(Task task) {
        UUID taskId = task.id().value();
        task.questions().forEach(question -> {
            entityManager.persist(new TaskQuestionJpaEntity(taskId, question));
            question.options().forEach(option -> entityManager.persist(
                    new TaskOptionJpaEntity(taskId, question, option)));
        });
    }

    private long questionCount(UUID taskId) {
        return entityManager.createQuery(
                        "SELECT COUNT(question) "
                                + "FROM TaskQuestionJpaEntity question "
                                + "WHERE question.taskId = :taskId",
                        Long.class)
                .setParameter("taskId", taskId)
                .getSingleResult();
    }
}
