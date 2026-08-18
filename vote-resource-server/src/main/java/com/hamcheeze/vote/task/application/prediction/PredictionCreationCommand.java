package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.task.Task;

import java.time.Duration;
import java.util.Objects;

public record PredictionCreationCommand(
        TaskPredictionId requestId,
        TaskPersonaId personaId,
        Task task,
        String candidatePolicyVersion,
        int requestedCandidateCount,
        Duration requestTimeout
) {
    public PredictionCreationCommand {
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(personaId, "personaId");
        Objects.requireNonNull(task, "task");
        if (candidatePolicyVersion == null
                || candidatePolicyVersion.isBlank()) {
            throw new IllegalArgumentException(
                    "candidatePolicyVersion must not be blank");
        }
        candidatePolicyVersion = candidatePolicyVersion.trim();
        if (requestedCandidateCount < 1) {
            throw new IllegalArgumentException(
                    "requestedCandidateCount must be positive");
        }
        Objects.requireNonNull(requestTimeout, "requestTimeout");
        if (requestTimeout.isZero() || requestTimeout.isNegative()) {
            throw new IllegalArgumentException(
                    "requestTimeout must be positive");
        }
    }
}
