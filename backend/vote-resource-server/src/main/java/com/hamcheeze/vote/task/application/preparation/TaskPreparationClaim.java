package com.hamcheeze.vote.task.application.preparation;

import java.util.Objects;

record TaskPreparationClaim(
        TaskPreparationCommand command,
        TaskPreparationRecord existing
) {
    TaskPreparationClaim {
        if ((command == null) == (existing == null)) {
            throw new IllegalArgumentException(
                    "exactly one of command and existing is required");
        }
    }

    static TaskPreparationClaim execute(TaskPreparationCommand command) {
        return new TaskPreparationClaim(
                Objects.requireNonNull(command, "command"), null);
    }

    static TaskPreparationClaim existing(TaskPreparationRecord existing) {
        return new TaskPreparationClaim(
                null, Objects.requireNonNull(existing, "existing"));
    }

    boolean requiresProviderCall() {
        return command != null;
    }
}
