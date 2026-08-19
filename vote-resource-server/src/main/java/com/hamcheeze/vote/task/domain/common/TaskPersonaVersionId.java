package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

public record TaskPersonaVersionId(UUID value) {
    public TaskPersonaVersionId {
        value = TaskIdSupport.require(
                value,
                "TASK_PERSONA_VERSION_ID_REQUIRED",
                "personaVersionId");
    }
}
