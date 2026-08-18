package com.hamcheeze.vote.task.application.idempotency;

import com.hamcheeze.vote.task.domain.common.TaskUserId;

import java.util.Objects;

public record TaskIdempotencyCommand(
        TaskUserId userId,
        TaskIdempotencyKey idempotencyKey,
        TaskRequestHash requestHash,
        int outcomeSchemaVersion
) {
    public TaskIdempotencyCommand {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        Objects.requireNonNull(requestHash, "requestHash");
        if (outcomeSchemaVersion <= 0) {
            throw new IllegalArgumentException(
                    "outcomeSchemaVersion must be positive");
        }
    }
}
