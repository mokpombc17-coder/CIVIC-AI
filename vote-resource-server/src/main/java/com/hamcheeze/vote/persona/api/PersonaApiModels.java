package com.hamcheeze.vote.persona.api;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus;

import java.util.List;
import java.util.UUID;

final class PersonaApiModels {

    private PersonaApiModels() {
    }

    record PersonaStatusResponse(
            boolean personaReady,
            String status,
            UUID sourceResponseId,
            UUID generationId,
            String lastErrorCode,
            List<String> capabilities
    ) {
        static PersonaStatusResponse from(CurrentPersonaStatus value) {
            return new PersonaStatusResponse(
                    value.personaReady(),
                    value.status().name(),
                    value.sourceResponseId().map(id -> id.value())
                            .orElse(null),
                    value.generationId().map(id -> id.value()).orElse(null),
                    value.lastErrorCode().orElse(null),
                    value.capabilities().stream().map(Enum::name).sorted()
                            .toList());
        }
    }
}
