package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;

import java.util.Objects;
import java.util.UUID;

public record OpinionMapGenerationRunClaim(
        UUID runId,
        OpinionMapGenerationId generationId,
        OpinionMapGenerationRun.Trigger trigger,
        UUID claimId,
        int attemptNumber,
        TaskId taskId,
        int resultVersion,
        String sourceBodySha256,
        String promptVersion
) {

    public OpinionMapGenerationRunClaim {
        Objects.requireNonNull(runId, "runId");
        Objects.requireNonNull(generationId, "generationId");
        Objects.requireNonNull(trigger, "trigger");
        Objects.requireNonNull(claimId, "claimId");
        if (attemptNumber < 1) {
            throw new IllegalArgumentException(
                    "attemptNumber must be positive");
        }
        Objects.requireNonNull(taskId, "taskId");
        if (resultVersion < 1) {
            throw new IllegalArgumentException(
                    "resultVersion must be positive");
        }
        sourceBodySha256 = requireText(
                sourceBodySha256, "sourceBodySha256");
        promptVersion = requireText(promptVersion, "promptVersion");
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value.trim();
    }
}
