package com.hamcheeze.vote.persona.domain;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.domain.common.PersonaVersionId;

import java.time.Instant;
import java.util.Objects;

public record PersonaVersion(
        PersonaVersionId personaVersionId,
        PersonaGenerationId generationId,
        PersonaUserId userId,
        PersonaId providerPersonaId,
        PredictedAdoptionRate predictedAdoptionRate,
        PersonaModelVersion modelVersion,
        Instant generatedAt,
        PersonaSourceType sourceType,
        PersonaSourceId sourceId
) {

    public PersonaVersion {
        Objects.requireNonNull(personaVersionId, "personaVersionId");
        Objects.requireNonNull(generationId, "generationId");
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(providerPersonaId, "providerPersonaId");
        Objects.requireNonNull(
                predictedAdoptionRate, "predictedAdoptionRate");
        Objects.requireNonNull(modelVersion, "modelVersion");
        Objects.requireNonNull(generatedAt, "generatedAt");
        Objects.requireNonNull(sourceType, "sourceType");
        Objects.requireNonNull(sourceId, "sourceId");
    }
}
