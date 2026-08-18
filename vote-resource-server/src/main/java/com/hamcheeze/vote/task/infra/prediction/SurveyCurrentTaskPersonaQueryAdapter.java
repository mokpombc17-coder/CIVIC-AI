package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus;
import com.hamcheeze.vote.persona.application.query.CurrentPersonaQueryService;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.Optional;

@Component
public class SurveyCurrentTaskPersonaQueryAdapter
        implements CurrentTaskPersonaQueryPort {

    private final CurrentPersonaQueryService currentPersonas;

    public SurveyCurrentTaskPersonaQueryAdapter(
            CurrentPersonaQueryService currentPersonas
    ) {
        this.currentPersonas = Objects.requireNonNull(
                currentPersonas, "currentPersonas");
    }

    @Override
    public Optional<CurrentTaskPersona> findCurrentUsable(
            TaskUserId userId
    ) {
        Objects.requireNonNull(userId, "userId");
        CurrentPersonaStatus current = currentPersonas.findCurrent(
                new SurveyUserId(userId.value()));
        if (!current.personaReady()) {
            return Optional.empty();
        }
        return Optional.of(new CurrentTaskPersona(
                new TaskPersonaGenerationId(
                        current.generationId().orElseThrow().value()),
                new TaskPersonaId(
                        current.personaId().orElseThrow().value())));
    }
}
