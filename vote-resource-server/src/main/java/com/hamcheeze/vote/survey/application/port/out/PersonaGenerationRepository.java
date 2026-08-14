package com.hamcheeze.vote.survey.application.port.out;

import com.hamcheeze.vote.survey.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.persona.PersonaGeneration;
import com.hamcheeze.vote.survey.domain.persona.PersonaId;

import java.time.Instant;
import java.util.Optional;

public interface PersonaGenerationRepository {

    PersonaGeneration insert(PersonaGeneration generation);

    PersonaGeneration save(PersonaGeneration generation);

    Optional<PersonaGeneration> findById(PersonaGenerationId generationId);

    Optional<PersonaGeneration> findBySourceResponseId(
            SurveyResponseId responseId);

    Optional<PersonaGeneration> findByPersonaId(PersonaId personaId);

    Optional<PersonaGeneration> findNextDispatchableForUpdate(Instant readyAt);
}
