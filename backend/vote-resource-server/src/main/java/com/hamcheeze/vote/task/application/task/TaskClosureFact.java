package com.hamcheeze.vote.task.application.task;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;

import java.time.Instant;
import java.util.Objects;

public record TaskClosureFact(
        TaskId taskId,
        TaskClosureType closureType,
        Instant closedAt,
        boolean resultEligible
) {
    public TaskClosureFact {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(closureType, "closureType");
        Objects.requireNonNull(closedAt, "closedAt");
        if (resultEligible != closureType.resultEligible()) {
            throw new IllegalArgumentException(
                    "resultEligible must match closureType policy");
        }
    }
}
