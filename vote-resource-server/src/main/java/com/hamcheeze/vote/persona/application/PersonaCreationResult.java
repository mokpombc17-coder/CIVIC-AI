package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaModelVersion;
import com.hamcheeze.vote.persona.domain.PredictedAdoptionRate;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;

import java.util.Objects;

public record PersonaCreationResult(
        PersonaGenerationId generationId,
        PersonaId personaId,
        PredictedAdoptionRate predictedAdoptionRate,
        PersonaModelVersion modelVersion
) {

    public PersonaCreationResult {
        Objects.requireNonNull(generationId, "generationId");
        Objects.requireNonNull(personaId, "personaId");
        Objects.requireNonNull(
                predictedAdoptionRate, "predictedAdoptionRate");
        Objects.requireNonNull(modelVersion, "modelVersion");
    }
}
