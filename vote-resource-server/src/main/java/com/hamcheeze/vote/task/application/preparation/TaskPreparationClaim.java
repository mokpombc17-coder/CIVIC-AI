package com.hamcheeze.vote.task.application.preparation;

import java.util.Objects;

record TaskPreparationClaim(
        TaskPreparationCommand command,
        TaskPreparationRecord ready
) {
    TaskPreparationClaim {
        if ((command == null) == (ready == null)) {
            throw new IllegalArgumentException(
                    "exactly one of command and ready is required");
        }
    }

    static TaskPreparationClaim execute(TaskPreparationCommand command) {
        return new TaskPreparationClaim(
                Objects.requireNonNull(command, "command"), null);
    }

    static TaskPreparationClaim ready(TaskPreparationRecord ready) {
        return new TaskPreparationClaim(
                null, Objects.requireNonNull(ready, "ready"));
    }

    boolean requiresProviderCall() {
        return command != null;
    }
}
