package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.port.out.TaskResultManifestRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.Optional;

@Repository
public class TaskResultManifestJpaAdapter
        implements TaskResultManifestRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public TaskResultManifest insert(TaskResultManifest manifest) {
        Objects.requireNonNull(manifest, "manifest");
        if (entityManager.find(
                TaskResultManifestJpaEntity.class,
                manifest.taskId().value()) != null) {
            throw new UnsupportedOperationException(
                    "task result manifest is immutable: "
                            + manifest.taskId());
        }
        TaskResultManifestJpaEntity entity =
                new TaskResultManifestJpaEntity(manifest);
        entityManager.persist(entity);
        entityManager.flush();
        return toDomain(entity);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TaskResultManifest> findByTaskId(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return Optional.ofNullable(entityManager.find(
                        TaskResultManifestJpaEntity.class,
                        taskId.value()))
                .map(TaskResultManifestJpaAdapter::toDomain);
    }

    private static TaskResultManifest toDomain(
            TaskResultManifestJpaEntity entity
    ) {
        return new TaskResultManifest(
                new TaskId(entity.taskId()),
                entity.resultVersion(),
                entity.schemaVersion(),
                entity.closedAt(),
                entity.responseCount(),
                entity.bodySha256(),
                entity.finalizedAt());
    }
}
