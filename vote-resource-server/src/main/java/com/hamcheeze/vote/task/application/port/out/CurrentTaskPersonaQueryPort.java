package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;

import java.util.Objects;
import java.util.Optional;

public interface CurrentTaskPersonaQueryPort {

    Optional<CurrentTaskPersona> findCurrentUsable(TaskUserId userId);

    record CurrentTaskPersona(
            TaskPersonaGenerationId generationId,
            TaskPersonaId personaId
    ) {
        public CurrentTaskPersona {
            Objects.requireNonNull(generationId, "generationId");
            Objects.requireNonNull(personaId, "personaId");
        }
    }
}
