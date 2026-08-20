package com.hamcheeze.vote.persona.api;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus;

import java.util.List;
import java.util.UUID;
import java.time.Instant;

final class PersonaApiModels {

    private PersonaApiModels() {
    }

    record PersonaStatusResponse(
            boolean personaReady,
            String status,
            UUID sourceResponseId,
            UUID generationId,
            UUID personaVersionId,
            String lastErrorCode,
            int attemptCount,
            Instant nextAttemptAt,
            boolean automaticRetryScheduled,
            boolean terminalFailure,
            List<String> capabilities
    ) {
        static PersonaStatusResponse from(CurrentPersonaStatus value) {
            return new PersonaStatusResponse(
                    value.personaReady(),
                    value.status().name(),
                    value.sourceResponseId().map(id -> id.value())
                            .orElse(null),
                    value.generationId().map(id -> id.value()).orElse(null),
                    value.personaVersionId().map(id -> id.value())
                            .orElse(null),
                    value.lastErrorCode().orElse(null),
                    value.attemptCount(),
                    value.nextAttemptAt().orElse(null),
                    value.automaticRetryScheduled(),
                    value.terminalFailure(),
                    value.capabilities().stream().map(Enum::name).sorted()
                            .toList());
        }
    }
}
