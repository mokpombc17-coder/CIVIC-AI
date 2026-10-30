package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1;

import java.time.Duration;
import java.util.Objects;
import java.util.UUID;

public record OpinionMapGenerationRequest(
        UUID generationId,
        TaskResultForLlmV1 input,
        String inputJsonl,
        String prompt,
        String promptVersion,
        Duration requestTimeout
) {

    public OpinionMapGenerationRequest {
        Objects.requireNonNull(generationId, "generationId");
        Objects.requireNonNull(input, "input");
        inputJsonl = requireText(inputJsonl, "inputJsonl");
        prompt = requireText(prompt, "prompt");
        promptVersion = requireText(promptVersion, "promptVersion");
        Objects.requireNonNull(requestTimeout, "requestTimeout");
        if (requestTimeout.isZero() || requestTimeout.isNegative()) {
            throw new IllegalArgumentException(
                    "requestTimeout must be positive");
        }
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
        return value;
    }
}
