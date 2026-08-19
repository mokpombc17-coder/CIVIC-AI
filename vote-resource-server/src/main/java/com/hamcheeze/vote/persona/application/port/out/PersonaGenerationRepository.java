package com.hamcheeze.vote.persona.application.port.out;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;

import java.time.Instant;
import java.util.Optional;

public interface PersonaGenerationRepository {

    PersonaGeneration insert(PersonaGeneration generation);

    PersonaGeneration save(PersonaGeneration generation);

    Optional<PersonaGeneration> findById(PersonaGenerationId generationId);

    Optional<PersonaGeneration> findBySourceResponseId(
            PersonaSourceId responseId);

    Optional<PersonaGeneration> findByPersonaId(PersonaId personaId);

    Optional<PersonaGeneration> findNextDispatchableForUpdate(Instant readyAt);
}
