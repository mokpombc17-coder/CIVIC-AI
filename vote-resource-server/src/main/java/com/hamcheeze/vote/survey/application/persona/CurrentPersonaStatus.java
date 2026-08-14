package com.hamcheeze.vote.survey.application.persona;

import com.hamcheeze.vote.survey.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceCapability;
import com.hamcheeze.vote.survey.domain.persona.PersonaGeneration;
import com.hamcheeze.vote.survey.domain.persona.PersonaGenerationStatus;
import com.hamcheeze.vote.survey.domain.persona.PersonaId;

import java.util.Optional;
import java.util.Objects;
import java.util.Set;

public record CurrentPersonaStatus(
        Optional<SurveyResponseId> sourceResponseId,
        Optional<PersonaGenerationId> generationId,
        Status status,
        Optional<PersonaId> personaId,
        Optional<String> lastErrorCode,
        boolean personaReady,
        Set<ServiceCapability> capabilities
) {

    private static final Set<ServiceCapability> READY_CAPABILITIES =
            Set.of(ServiceCapability.USE_PERSONALIZED_SERVICE);

    public CurrentPersonaStatus {
        sourceResponseId = Objects.requireNonNull(
                sourceResponseId, "sourceResponseId");
        generationId = Objects.requireNonNull(generationId, "generationId");
        Objects.requireNonNull(status, "status");
        personaId = Objects.requireNonNull(personaId, "personaId");
        lastErrorCode = Objects.requireNonNull(
                lastErrorCode, "lastErrorCode");
        capabilities = Set.copyOf(Objects.requireNonNull(
                capabilities, "capabilities"));
    }

    public static CurrentPersonaStatus notSubmitted() {
        return new CurrentPersonaStatus(
                Optional.empty(), Optional.empty(), Status.NOT_SUBMITTED,
                Optional.empty(), Optional.empty(), false, Set.of());
    }

    public static CurrentPersonaStatus generationMissing(
            SurveyResponseId responseId
    ) {
        return new CurrentPersonaStatus(
                Optional.of(responseId), Optional.empty(),
                Status.GENERATION_MISSING, Optional.empty(),
                Optional.empty(), false, Set.of());
    }

    public static CurrentPersonaStatus from(PersonaGeneration generation) {
        boolean ready = generation.status()
                == PersonaGenerationStatus.SUCCEEDED
                && generation.personaId().isPresent();
        return new CurrentPersonaStatus(
                Optional.of(generation.sourceResponseId()),
                Optional.of(generation.id()),
                Status.valueOf(generation.status().name()),
                generation.personaId(),
                generation.lastErrorCode(),
                ready,
                ready ? READY_CAPABILITIES : Set.of());
    }

    public enum Status {
        NOT_SUBMITTED,
        GENERATION_MISSING,
        PENDING,
        PROCESSING,
        SUCCEEDED,
        FAILED
    }
}
