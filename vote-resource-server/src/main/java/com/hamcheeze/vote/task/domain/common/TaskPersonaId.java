package com.hamcheeze.vote.task.domain.common;

public record TaskPersonaId(String value) {
    public TaskPersonaId {
        value = TaskText.required(
                value,
                TaskLimits.MAX_PERSONA_ID_LENGTH,
                "TASK_PERSONA_ID",
                "personaId");
    }
}
