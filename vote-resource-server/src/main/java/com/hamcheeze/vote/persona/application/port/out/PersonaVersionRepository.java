package com.hamcheeze.vote.persona.application.port.out;

import com.hamcheeze.vote.persona.domain.PersonaVersion;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.domain.common.PersonaVersionId;

import java.util.Optional;

public interface PersonaVersionRepository {

    PersonaVersion insert(PersonaVersion version);

    Optional<PersonaVersion> findById(PersonaVersionId versionId);

    Optional<PersonaVersion> findByGenerationId(
            PersonaGenerationId generationId);

    Optional<PersonaVersion> findLatestByUserId(PersonaUserId userId);
}
