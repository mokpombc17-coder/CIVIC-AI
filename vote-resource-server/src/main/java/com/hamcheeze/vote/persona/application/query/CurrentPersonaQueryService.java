package com.hamcheeze.vote.persona.application.query;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

@Service
public class CurrentPersonaQueryService {

    private final PersonaSurveySourceQueryPort sources;
    private final PersonaGenerationRepository generations;

    public CurrentPersonaQueryService(
            PersonaSurveySourceQueryPort sources,
            PersonaGenerationRepository generations
    ) {
        this.sources = Objects.requireNonNull(sources, "sources");
        this.generations = Objects.requireNonNull(
                generations, "generations");
    }

    @Transactional(readOnly = true)
    public CurrentPersonaStatus findCurrent(PersonaUserId userId) {
        Objects.requireNonNull(userId, "userId");
        return sources.findLatestSourceIdByUserId(userId)
                .map(sourceId -> generations
                        .findBySourceResponseId(sourceId)
                        .map(CurrentPersonaStatus::from)
                        .orElseGet(() -> CurrentPersonaStatus
                                .generationMissing(sourceId)))
                .orElseGet(CurrentPersonaStatus::notSubmitted);
    }
}
