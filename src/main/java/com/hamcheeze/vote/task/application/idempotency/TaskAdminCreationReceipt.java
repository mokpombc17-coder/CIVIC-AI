package com.hamcheeze.vote.task.application.idempotency;

import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;

import java.time.Instant;
import java.util.Objects;

public record TaskAdminCreationReceipt(
        TaskActorId actorId,
        TaskIdempotencyKey idempotencyKey,
        TaskRequestHash requestHash,
        TaskId taskId,
        Instant createdAt
) {
    public TaskAdminCreationReceipt {
        Objects.requireNonNull(actorId, "actorId");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        Objects.requireNonNull(requestHash, "requestHash");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(createdAt, "createdAt");
    }
}
