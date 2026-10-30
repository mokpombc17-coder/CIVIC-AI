package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "opinion_map_generations")
class OpinionMapGenerationJpaEntity {

    @Id
    @Column(name = "generation_id", nullable = false)
    private UUID generationId;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "result_version", nullable = false)
    private int resultVersion;

    @Column(name = "source_body_sha256", nullable = false, length = 64)
    private String sourceBodySha256;

    @Column(name = "prompt_version", nullable = false, length = 100)
    private String promptVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private OpinionMapGenerationStatus status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at")
    private Instant nextAttemptAt;

    @Column(name = "output_json", columnDefinition = "text")
    private String outputJson;

    @Column(name = "last_error_code", length = 200)
    private String lastErrorCode;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "processing_started_at")
    private Instant processingStartedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "active_claim_id")
    private UUID activeClaimId;

    @Column(name = "lease_expires_at")
    private Instant leaseExpiresAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected OpinionMapGenerationJpaEntity() {
    }

    void apply(OpinionMapGeneration generation) {
        generationId = generation.id().value();
        taskId = generation.taskId().value();
        resultVersion = generation.resultVersion();
        sourceBodySha256 = generation.sourceBodySha256();
        promptVersion = generation.promptVersion();
        status = generation.status();
        attemptCount = generation.attemptCount();
        nextAttemptAt = generation.nextAttemptAt();
        outputJson = generation.outputJson();
        lastErrorCode = generation.lastErrorCode();
        createdAt = generation.createdAt();
        processingStartedAt = generation.processingStartedAt();
        completedAt = generation.completedAt();
        activeClaimId = generation.activeClaimId();
        leaseExpiresAt = generation.leaseExpiresAt();
        updatedAt = generation.updatedAt();
    }

    OpinionMapGeneration toDomain() {
        return OpinionMapGeneration.restore(
                new OpinionMapGenerationId(generationId),
                new TaskId(taskId),
                resultVersion,
                sourceBodySha256,
                promptVersion,
                status,
                attemptCount,
                nextAttemptAt,
                outputJson,
                lastErrorCode,
                createdAt,
                processingStartedAt,
                completedAt,
                activeClaimId,
                leaseExpiresAt,
                updatedAt);
    }

    UUID generationId() { return generationId; }
}
