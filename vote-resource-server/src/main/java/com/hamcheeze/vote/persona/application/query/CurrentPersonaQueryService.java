package com.hamcheeze.vote.persona.application.query;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

@Service
public class CurrentPersonaQueryService {

    private final SurveyResponseRepository responses;
    private final PersonaGenerationRepository generations;

    public CurrentPersonaQueryService(
            SurveyResponseRepository responses,
            PersonaGenerationRepository generations
    ) {
        this.responses = Objects.requireNonNull(responses, "responses");
        this.generations = Objects.requireNonNull(
                generations, "generations");
    }

    @Transactional(readOnly = true)
    public CurrentPersonaStatus findCurrent(SurveyUserId userId) {
        Objects.requireNonNull(userId, "userId");
        return responses.findLatestByUserId(userId)
                .map(response -> generations
                        .findBySourceResponseId(response.id())
                        .map(CurrentPersonaStatus::from)
                        .orElseGet(() -> CurrentPersonaStatus
                                .generationMissing(response.id())))
                .orElseGet(CurrentPersonaStatus::notSubmitted);
    }
}
