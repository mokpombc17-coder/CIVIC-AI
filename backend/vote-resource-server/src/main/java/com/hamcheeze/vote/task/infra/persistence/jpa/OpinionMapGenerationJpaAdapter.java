package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class OpinionMapGenerationJpaAdapter
        implements OpinionMapGenerationRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public boolean insertIfAbsent(OpinionMapGeneration generation) {
        Objects.requireNonNull(generation, "generation");
        int inserted = entityManager.createNativeQuery("""
                        INSERT INTO opinion_map_generations (
                            generation_id,
                            task_id,
                            result_version,
                            source_body_sha256,
                            prompt_version,
                            status,
                            attempt_count,
                            created_at,
                            updated_at
                        ) VALUES (
                            :generationId,
                            :taskId,
                            :resultVersion,
                            :sourceBodySha256,
                            :promptVersion,
                            'PENDING',
                            0,
                            :createdAt,
                            :updatedAt
                        )
                        ON CONFLICT (task_id, result_version) DO NOTHING
                        """)
                .setParameter("generationId", generation.id().value())
                .setParameter("taskId", generation.taskId().value())
                .setParameter("resultVersion", generation.resultVersion())
                .setParameter(
                        "sourceBodySha256",
                        generation.sourceBodySha256())
                .setParameter("promptVersion", generation.promptVersion())
                .setParameter("createdAt", generation.createdAt())
                .setParameter("updatedAt", generation.updatedAt())
                .executeUpdate();
        return inserted == 1;
    }

    @Override
    @Transactional
    public OpinionMapGeneration save(OpinionMapGeneration generation) {
        Objects.requireNonNull(generation, "generation");
        OpinionMapGenerationJpaEntity entity = entityManager.find(
                OpinionMapGenerationJpaEntity.class,
                generation.id().value(),
                LockModeType.PESSIMISTIC_WRITE);
        if (entity == null) {
            throw new IllegalStateException(
                    "Opinion Map generation does not exist: "
                            + generation.id().value());
        }
        entity.apply(generation);
        entityManager.flush();
        return entity.toDomain();
    }

    @Override
    @Transactional
    public Optional<OpinionMapGeneration> findByIdForUpdate(
            OpinionMapGenerationId generationId
    ) {
        Objects.requireNonNull(generationId, "generationId");
        return Optional.ofNullable(entityManager.find(
                        OpinionMapGenerationJpaEntity.class,
                        generationId.value(),
                        LockModeType.PESSIMISTIC_WRITE))
                .map(OpinionMapGenerationJpaEntity::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OpinionMapGeneration> findByTaskResult(
            TaskId taskId,
            int resultVersion
    ) {
        Objects.requireNonNull(taskId, "taskId");
        return entityManager.createQuery("""
                        SELECT generation
                        FROM OpinionMapGenerationJpaEntity generation
                        WHERE generation.taskId = :taskId
                          AND generation.resultVersion = :resultVersion
                        """, OpinionMapGenerationJpaEntity.class)
                .setParameter("taskId", taskId.value())
                .setParameter("resultVersion", resultVersion)
                .setMaxResults(1)
                .getResultList()
                .stream()
                .findFirst()
                .map(OpinionMapGenerationJpaEntity::toDomain);
    }

    @Override
    @Transactional
    public Optional<OpinionMapGeneration> findByTaskResultForUpdate(
            TaskId taskId,
            int resultVersion
    ) {
        Objects.requireNonNull(taskId, "taskId");
        return entityManager.createQuery("""
                        SELECT generation
                        FROM OpinionMapGenerationJpaEntity generation
                        WHERE generation.taskId = :taskId
                          AND generation.resultVersion = :resultVersion
                        """, OpinionMapGenerationJpaEntity.class)
                .setParameter("taskId", taskId.value())
                .setParameter("resultVersion", resultVersion)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .setMaxResults(1)
                .getResultList()
                .stream()
                .findFirst()
                .map(OpinionMapGenerationJpaEntity::toDomain);
    }

    @Override
    @Transactional
    @SuppressWarnings("unchecked")
    public Optional<OpinionMapGeneration> findNextDispatchableForUpdate(
            Instant dueAt
    ) {
        Objects.requireNonNull(dueAt, "dueAt");
        List<UUID> ids = entityManager.createNativeQuery("""
                        SELECT generation.generation_id
                        FROM opinion_map_generations generation
                        WHERE generation.status = 'PENDING'
                           OR (generation.status = 'RETRY_WAIT'
                               AND generation.next_attempt_at <= :now)
                           OR (generation.status = 'PROCESSING'
                               AND generation.lease_expires_at <= :now)
                        ORDER BY COALESCE(
                                     generation.next_attempt_at,
                                     generation.lease_expires_at,
                                     generation.created_at),
                                 generation.created_at,
                                 generation.generation_id
                        FOR UPDATE SKIP LOCKED
                        LIMIT 1
                        """, UUID.class)
                .setParameter("now", dueAt)
                .getResultList();
        if (ids.isEmpty()) {
            return Optional.empty();
        }
        return Optional.ofNullable(entityManager.find(
                        OpinionMapGenerationJpaEntity.class,
                        ids.getFirst()))
                .map(OpinionMapGenerationJpaEntity::toDomain);
    }
}
