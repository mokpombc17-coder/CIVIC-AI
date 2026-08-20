package com.hamcheeze.vote.persona.application.port.out;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;

import java.time.Instant;
import java.util.Optional;

public interface PersonaGenerationRepository {

    PersonaGeneration insert(PersonaGeneration generation);

    PersonaGeneration save(PersonaGeneration generation);

    Optional<PersonaGeneration> findById(PersonaGenerationId generationId);

    Optional<PersonaGeneration> findByIdForUpdate(
            PersonaGenerationId generationId);

    Optional<PersonaGeneration> findBySource(
            PersonaSourceType sourceType,
            PersonaSourceId sourceId);

    Optional<PersonaGeneration> findByPersonaId(PersonaId personaId);

    Optional<PersonaGeneration> findNextDispatchableForUpdate(Instant readyAt);

    Optional<PersonaGeneration> findNextExpiredLeaseForUpdate(Instant now);
}
