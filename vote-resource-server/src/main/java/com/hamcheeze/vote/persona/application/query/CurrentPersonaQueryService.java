package com.hamcheeze.vote.persona.application.query;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.application.port.out.PersonaVersionRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaGenerationStatus;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.Optional;

@Service
public class CurrentPersonaQueryService {

    private final PersonaSurveySourceQueryPort sources;
    private final PersonaGenerationRepository generations;
    private final PersonaVersionRepository versions;

    public CurrentPersonaQueryService(
            PersonaSurveySourceQueryPort sources,
            PersonaGenerationRepository generations,
            PersonaVersionRepository versions
    ) {
        this.sources = Objects.requireNonNull(sources, "sources");
        this.generations = Objects.requireNonNull(
                generations, "generations");
        this.versions = Objects.requireNonNull(versions, "versions");
    }

    @Transactional(readOnly = true)
    public CurrentPersonaStatus findCurrent(PersonaUserId userId) {
        Objects.requireNonNull(userId, "userId");
        return sources.findLatestSourceIdByUserId(userId)
                .map(sourceId -> generations
                        .findBySource(
                                PersonaSourceType.SURVEY_RESPONSE, sourceId)
                        .map(this::toCurrentStatus)
                        .orElseGet(() -> CurrentPersonaStatus
                                .generationMissing(sourceId)))
                .orElseGet(CurrentPersonaStatus::notSubmitted);
    }

    private CurrentPersonaStatus toCurrentStatus(PersonaGeneration generation) {
        if (generation.status() != PersonaGenerationStatus.SUCCEEDED) {
            return CurrentPersonaStatus.from(generation, Optional.empty());
        }
        return CurrentPersonaStatus.from(
                generation,
                Optional.of(versions
                        .findByGenerationId(generation.id())
                        .orElseThrow(() -> new IllegalStateException(
                                "succeeded current persona has no version"))
                        .personaVersionId()));
    }
}
