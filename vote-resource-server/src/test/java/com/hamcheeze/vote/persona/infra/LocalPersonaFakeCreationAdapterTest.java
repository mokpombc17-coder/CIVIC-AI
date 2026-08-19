package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.PersonaCreationCommand;
import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class LocalPersonaFakeCreationAdapterTest {

    @Test
    void sameGenerationReceivesSamePersonaId() {
        var adapter = new LocalPersonaFakeCreationAdapter();
        PersonaCreationCommand command = command();

        var first = adapter.create(command);
        var second = adapter.create(command);

        assertThat(second).isEqualTo(first);
        assertThat(first.generationId()).isEqualTo(command.generationId());
        assertThat(first.personaId().value()).isNotBlank();
        assertThat(first.predictedAdoptionRate().value())
                .isEqualByComparingTo("0.5");
        assertThat(first.modelVersion().value()).isEqualTo("local-fake-v1");
    }

    private static PersonaCreationCommand command() {
        UUID generationId = UUID.fromString(
                "13040000-0000-0000-0000-000000000001");
        PersonaSurveySource source = new PersonaSurveySource(
                new PersonaSourceId(UUID.fromString(
                        "13040000-0000-0000-0000-000000000002")),
                new PersonaUserId("local-user"),
                UUID.fromString(
                        "13040000-0000-0000-0000-000000000003"),
                1,
                UUID.fromString(
                        "13040000-0000-0000-0000-000000000004"),
                1,
                Instant.parse("2026-08-18T00:00:00Z"),
                List.of());
        return new PersonaCreationCommand(
                new PersonaGenerationId(generationId),
                PersonaCreationCommand.CURRENT_SCHEMA_VERSION,
                source);
    }
}
