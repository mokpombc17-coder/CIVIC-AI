package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.Objects;

@Component
public final class OpinionMapGenerationOutputReader {

    private final ObjectMapper objectMapper;

    public OpinionMapGenerationOutputReader(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
    }

    public OpinionMapOptionExplanationV1 read(
            OpinionMapGeneration generation
    ) {
        Objects.requireNonNull(generation, "generation");
        if (generation.status() != OpinionMapGenerationStatus.AVAILABLE) {
            throw new IllegalArgumentException(
                    "only available Opinion Map output can be read");
        }
        try {
            OpinionMapOptionExplanationV1 output = objectMapper.readValue(
                    generation.outputJson(),
                    OpinionMapOptionExplanationV1.class);
            if (output.status()
                    != OpinionMapOptionExplanationV1.GenerationStatus.COMPLETED
                    || !output.taskId().equals(generation.taskId().value())
                    || output.resultVersion() != generation.resultVersion()) {
                throw new IllegalStateException(
                        "stored Opinion Map output identity does not match");
            }
            return output;
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "stored Opinion Map output is invalid", exception);
        }
    }
}
