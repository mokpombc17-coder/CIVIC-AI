package com.hamcheeze.vote.task.domain.common;

import java.util.List;
import java.util.Objects;

public final class TaskValidationException extends RuntimeException {

    private final List<TaskViolation> violations;

    public TaskValidationException(List<TaskViolation> violations) {
        super(messageFor(violations));
        this.violations = List.copyOf(violations);
    }

    public List<TaskViolation> violations() {
        return violations;
    }

    private static String messageFor(List<TaskViolation> violations) {
        Objects.requireNonNull(violations, "violations");
        if (violations.isEmpty()) {
            throw new IllegalArgumentException("violations must not be empty");
        }
        if (violations.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "violations must not contain null");
        }
        return "Task validation failed with "
                + violations.size()
                + " violation(s)";
    }
}
