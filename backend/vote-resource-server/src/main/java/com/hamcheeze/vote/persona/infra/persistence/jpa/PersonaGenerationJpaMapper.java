package com.hamcheeze.vote.persona.infra.persistence.jpa;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;

final class PersonaGenerationJpaMapper {

    private PersonaGenerationJpaMapper() {
    }

    static PersonaGeneration toDomain(PersonaGenerationJpaEntity entity) {
        return PersonaGeneration.restore(
                new PersonaGenerationId(entity.id()),
                entity.sourceType(),
                new PersonaSourceId(entity.sourceId()),
                entity.status(),
                entity.attemptCount(),
                entity.personaId() == null
                        ? null : new PersonaId(entity.personaId()),
                entity.lastErrorCode(),
                entity.createdAt(),
                entity.processingStartedAt(),
                entity.completedAt(),
                entity.nextAttemptAt(),
                entity.retryTrigger(),
                entity.claimToken() == null
                        ? null
                        : new PersonaGenerationClaimToken(
                                entity.claimToken()),
                entity.leaseExpiresAt(),
                entity.updatedAt());
    }
}
