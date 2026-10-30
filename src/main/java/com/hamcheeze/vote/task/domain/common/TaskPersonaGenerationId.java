package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

public record TaskPersonaGenerationId(UUID value) {
    public TaskPersonaGenerationId {
        value = TaskIdSupport.require(
                value,
                "TASK_PERSONA_GENERATION_ID_REQUIRED",
                "personaGenerationId");
    }
}
