package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaVersionRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaModelVersion;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.PersonaVersion;
import com.hamcheeze.vote.persona.domain.PredictedAdoptionRate;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PersonaGenerationStateServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-18T00:00:00Z");

    private final PersonaGenerationRepository generations =
            mock(PersonaGenerationRepository.class);
    private final PersonaVersionRepository versions =
            mock(PersonaVersionRepository.class);
    private final PersonaGenerationStateService states =
            new PersonaGenerationStateService(
                    generations,
                    versions,
                    Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void successStoresGenerationAndPersonaVersionTogether() {
        PersonaGenerationId generationId = new PersonaGenerationId(uuid(1));
        SurveyResponseId responseId = new SurveyResponseId(uuid(2));
        PersonaGeneration generation = PersonaGeneration.pending(
                generationId,
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(responseId.value()),
                NOW.minusSeconds(10));
        generation.startProcessing(NOW.minusSeconds(5));
        PersonaSurveySource source = source(responseId);
        PersonaCreationResult result = new PersonaCreationResult(
                generationId,
                new PersonaId("provider-persona-1"),
                new PredictedAdoptionRate(new BigDecimal("0.72")),
                new PersonaModelVersion("model-v3"));
        when(generations.findById(generationId))
                .thenReturn(Optional.of(generation));
        when(versions.insert(any()))
                .thenAnswer(invocation -> invocation.getArgument(0));

        PersonaVersion stored = states.succeed(
                generationId, source, result);

        verify(generations).save(generation);
        verify(versions).insert(stored);
        assertThat(generation.personaId()).contains(result.personaId());
        assertThat(generation.completedAt()).contains(NOW);
        assertThat(stored.generationId()).isEqualTo(generationId);
        assertThat(stored.userId().value()).isEqualTo("user-1");
        assertThat(stored.providerPersonaId()).isEqualTo(result.personaId());
        assertThat(stored.predictedAdoptionRate())
                .isEqualTo(result.predictedAdoptionRate());
        assertThat(stored.modelVersion()).isEqualTo(result.modelVersion());
        assertThat(stored.generatedAt()).isEqualTo(NOW);
        assertThat(stored.sourceType())
                .isEqualTo(PersonaSourceType.SURVEY_RESPONSE);
        assertThat(stored.sourceId().value()).isEqualTo(responseId.value());
    }

    private static PersonaSurveySource source(SurveyResponseId responseId) {
        return new PersonaSurveySource(
                new PersonaSourceId(responseId.value()),
                new PersonaUserId("user-1"),
                uuid(3),
                1,
                uuid(4),
                1,
                NOW.minusSeconds(20),
                List.of());
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13060000-0000-0000-0000-%012d".formatted(suffix));
    }
}
