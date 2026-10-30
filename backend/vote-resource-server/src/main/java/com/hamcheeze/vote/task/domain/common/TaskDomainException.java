package com.hamcheeze.vote.task.domain.common;

import java.util.Objects;

public final class TaskDomainException extends RuntimeException {

    private final TaskViolation violation;

    public TaskDomainException(TaskViolation violation) {
        super(Objects.requireNonNull(violation, "violation").message());
        this.violation = violation;
    }

    public static TaskDomainException invariant(
            String code,
            String path,
            String message
    ) {
        return new TaskDomainException(TaskViolation.of(code, path, message));
    }

    public TaskViolation violation() {
        return violation;
    }
}
