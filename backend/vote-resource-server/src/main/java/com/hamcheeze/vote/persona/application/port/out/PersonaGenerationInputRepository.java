package com.hamcheeze.vote.persona.application.port.out;

import com.hamcheeze.vote.persona.application.PersonaGenerationInputSnapshot;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;

import java.util.Optional;

public interface PersonaGenerationInputRepository {

    PersonaGenerationInputSnapshot insert(
            PersonaGenerationInputSnapshot snapshot);

    Optional<PersonaGenerationInputSnapshot> findByGenerationId(
            PersonaGenerationId generationId);
}
