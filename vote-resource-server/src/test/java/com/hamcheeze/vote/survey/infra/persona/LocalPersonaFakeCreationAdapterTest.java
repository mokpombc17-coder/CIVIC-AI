package com.hamcheeze.vote.survey.infra.persona;

import com.hamcheeze.vote.survey.application.persona.PersonaCreationCommand;
import com.hamcheeze.vote.survey.application.persona.PersonaSurveySource;
import com.hamcheeze.vote.survey.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
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
    }

    private static PersonaCreationCommand command() {
        UUID generationId = UUID.fromString(
                "13040000-0000-0000-0000-000000000001");
        PersonaSurveySource source = new PersonaSurveySource(
                new SurveyResponseId(UUID.fromString(
                        "13040000-0000-0000-0000-000000000002")),
                new SurveyUserId("local-user"),
                new SurveyRoundId(UUID.fromString(
                        "13040000-0000-0000-0000-000000000003")),
                new SurveyRoundNumber(1),
                new SurveyContentVersionId(UUID.fromString(
                        "13040000-0000-0000-0000-000000000004")),
                new SurveyContentVersionNumber(1),
                Instant.parse("2026-08-18T00:00:00Z"),
                List.of());
        return new PersonaCreationCommand(
                new PersonaGenerationId(generationId),
                PersonaCreationCommand.CURRENT_SCHEMA_VERSION,
                source);
    }
}
