package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaGenerationStatus;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaVersionId;

import java.util.Objects;
import java.util.Optional;
import java.util.Set;

public record CurrentPersonaStatus(
        Optional<PersonaSourceId> sourceResponseId,
        Optional<PersonaGenerationId> generationId,
        Optional<PersonaVersionId> personaVersionId,
        Status status,
        Optional<PersonaId> personaId,
        Optional<String> lastErrorCode,
        boolean personaReady,
        Set<Capability> capabilities
) {

    private static final Set<Capability> READY_CAPABILITIES =
            Set.of(Capability.USE_PERSONALIZED_SERVICE);

    public CurrentPersonaStatus {
        sourceResponseId = Objects.requireNonNull(
                sourceResponseId, "sourceResponseId");
        generationId = Objects.requireNonNull(generationId, "generationId");
        personaVersionId = Objects.requireNonNull(
                personaVersionId, "personaVersionId");
        Objects.requireNonNull(status, "status");
        personaId = Objects.requireNonNull(personaId, "personaId");
        lastErrorCode = Objects.requireNonNull(
                lastErrorCode, "lastErrorCode");
        capabilities = Set.copyOf(Objects.requireNonNull(
                capabilities, "capabilities"));
    }

    public static CurrentPersonaStatus notSubmitted() {
        return new CurrentPersonaStatus(
                Optional.empty(), Optional.empty(), Optional.empty(),
                Status.NOT_SUBMITTED,
                Optional.empty(), Optional.empty(), false, Set.of());
    }

    public static CurrentPersonaStatus generationMissing(
            PersonaSourceId responseId
    ) {
        return new CurrentPersonaStatus(
                Optional.of(responseId), Optional.empty(),
                Optional.empty(), Status.GENERATION_MISSING, Optional.empty(),
                Optional.empty(), false, Set.of());
    }

    public static CurrentPersonaStatus from(
            PersonaGeneration generation,
            Optional<PersonaVersionId> personaVersionId
    ) {
        Objects.requireNonNull(generation, "generation");
        Objects.requireNonNull(personaVersionId, "personaVersionId");
        boolean ready = generation.status()
                == PersonaGenerationStatus.SUCCEEDED
                && generation.personaId().isPresent();
        if (ready && personaVersionId.isEmpty()) {
            throw new IllegalStateException(
                    "succeeded current persona has no version");
        }
        return new CurrentPersonaStatus(
                Optional.of(generation.sourceId()),
                Optional.of(generation.id()),
                personaVersionId,
                Status.valueOf(generation.status().name()),
                generation.personaId(),
                generation.lastErrorCode(),
                ready,
                ready ? READY_CAPABILITIES : Set.of());
    }

    public enum Capability {
        USE_PERSONALIZED_SERVICE
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
