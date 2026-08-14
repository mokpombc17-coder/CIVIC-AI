package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.persona.PersonaGeneration;
import com.hamcheeze.vote.survey.domain.persona.PersonaId;

final class PersonaGenerationJpaMapper {

    private PersonaGenerationJpaMapper() {
    }

    static PersonaGeneration toDomain(PersonaGenerationJpaEntity entity) {
        return PersonaGeneration.restore(
                new PersonaGenerationId(entity.id()),
                new SurveyResponseId(entity.sourceResponseId()),
                entity.status(),
                entity.attemptCount(),
                entity.personaId() == null
                        ? null : new PersonaId(entity.personaId()),
                entity.lastErrorCode(),
                entity.createdAt(),
                entity.processingStartedAt(),
                entity.completedAt(),
                entity.nextAttemptAt(),
                entity.updatedAt());
    }
}
