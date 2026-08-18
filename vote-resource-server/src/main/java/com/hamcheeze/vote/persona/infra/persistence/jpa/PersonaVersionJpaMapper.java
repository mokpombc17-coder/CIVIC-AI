package com.hamcheeze.vote.persona.infra.persistence.jpa;

import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaModelVersion;
import com.hamcheeze.vote.persona.domain.PersonaVersion;
import com.hamcheeze.vote.persona.domain.PredictedAdoptionRate;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.domain.common.PersonaVersionId;

final class PersonaVersionJpaMapper {

    private PersonaVersionJpaMapper() {
    }

    static PersonaVersion toDomain(PersonaVersionJpaEntity entity) {
        return new PersonaVersion(
                new PersonaVersionId(entity.id()),
                new PersonaGenerationId(entity.generationId()),
                new PersonaUserId(entity.userId()),
                new PersonaId(entity.providerPersonaId()),
                new PredictedAdoptionRate(
                        entity.predictedAdoptionRate()),
                new PersonaModelVersion(entity.modelVersion()),
                entity.generatedAt(),
                entity.sourceType(),
                new PersonaSourceId(entity.sourceId()));
    }
}
