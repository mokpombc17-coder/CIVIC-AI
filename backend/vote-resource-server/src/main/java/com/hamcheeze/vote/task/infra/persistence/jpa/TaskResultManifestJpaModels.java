package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "task_result_manifests")
class TaskResultManifestJpaEntity {

    @Id
    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "result_version", nullable = false)
    private int resultVersion;

    @Column(name = "schema_version", nullable = false, length = 50)
    private String schemaVersion;

    @Column(name = "closed_at", nullable = false)
    private Instant closedAt;

    @Column(name = "response_count", nullable = false)
    private int responseCount;

    @Column(name = "body_sha256", nullable = false, length = 64)
    private String bodySha256;

    @Column(name = "finalized_at", nullable = false)
    private Instant finalizedAt;

    protected TaskResultManifestJpaEntity() {
    }

    TaskResultManifestJpaEntity(TaskResultManifest manifest) {
        taskId = manifest.taskId().value();
        resultVersion = manifest.resultVersion();
        schemaVersion = manifest.schemaVersion();
        closedAt = manifest.closedAt();
        responseCount = manifest.responseCount();
        bodySha256 = manifest.bodySha256();
        finalizedAt = manifest.finalizedAt();
    }

    UUID taskId() { return taskId; }
    int resultVersion() { return resultVersion; }
    String schemaVersion() { return schemaVersion; }
    Instant closedAt() { return closedAt; }
    int responseCount() { return responseCount; }
    String bodySha256() { return bodySha256; }
    Instant finalizedAt() { return finalizedAt; }
}
