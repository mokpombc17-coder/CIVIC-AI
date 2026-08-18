package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.application.port.in.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.application.port.out.PersonaCreationPort;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaModelVersion;
import com.hamcheeze.vote.persona.domain.PredictedAdoptionRate;
import com.hamcheeze.vote.persona.infra.PersonaGenerationProperties;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PersonaGenerationDispatcherTest {

    private static final Instant NOW =
            Instant.parse("2026-08-14T00:00:00Z");

    private final PersonaGenerationStateService states =
            mock(PersonaGenerationStateService.class);
    private final PersonaSurveySourceQueryPort sources =
            mock(PersonaSurveySourceQueryPort.class);
    private final PersonaCreationPort personaCreation =
            mock(PersonaCreationPort.class);
    private final PersonaGenerationProperties properties = properties();
    private final PersonaGenerationDispatcher dispatcher =
            new PersonaGenerationDispatcher(
                    states,
                    sources,
                    personaCreation,
                    properties,
                    Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void retryUsesTheSameGenerationIdAndSourcePayload() {
        PersonaGenerationId generationId = generationId();
        SurveyResponseId responseId = responseId();
        PersonaGeneration firstAttempt = processing(
                generationId, responseId, 1);
        PersonaGeneration secondAttempt = processing(
                generationId, responseId, 2);
        PersonaSurveySource source = source(responseId);
        when(states.claimNext()).thenReturn(
                Optional.of(firstAttempt),
                Optional.of(secondAttempt));
        when(sources.getByResponseId(sourceId(responseId))).thenReturn(source);
        when(personaCreation.create(org.mockito.ArgumentMatchers.any()))
                .thenThrow(new PersonaCreationException(
                        PersonaCreationErrorCode.TIMEOUT,
                        true,
                        "timeout"))
                .thenReturn(new PersonaCreationResult(
                        generationId,
                        new PersonaId("persona-a"),
                        new PredictedAdoptionRate(new BigDecimal("0.72")),
                        new PersonaModelVersion("model-v1")));

        assertThat(dispatcher.dispatchAvailable()).isEqualTo(1);
        assertThat(dispatcher.dispatchAvailable()).isEqualTo(1);

        ArgumentCaptor<PersonaCreationCommand> commands =
                ArgumentCaptor.forClass(PersonaCreationCommand.class);
        verify(personaCreation,
                org.mockito.Mockito.times(2)).create(commands.capture());
        assertThat(commands.getAllValues())
                .extracting(PersonaCreationCommand::generationId)
                .containsOnly(generationId);
        assertThat(commands.getAllValues())
                .extracting(PersonaCreationCommand::source)
                .containsOnly(source);
        verify(states).fail(
                generationId,
                PersonaCreationErrorCode.TIMEOUT.name(),
                NOW.plusSeconds(30));
        verify(states).succeed(generationId, source,
                new PersonaCreationResult(
                        generationId,
                        new PersonaId("persona-a"),
                        new PredictedAdoptionRate(new BigDecimal("0.72")),
                        new PersonaModelVersion("model-v1")));
    }

    @Test
    void finalAttemptFailureIsRecordedWithoutAnotherRetry() {
        PersonaGeneration generation = processing(
                generationId(), responseId(), properties.getMaxAttempts());
        when(states.claimNext()).thenReturn(Optional.of(generation));
        when(sources.getByResponseId(generation.sourceResponseId()))
                .thenReturn(source(generation.sourceResponseId()));
        when(personaCreation.create(org.mockito.ArgumentMatchers.any()))
                .thenThrow(new PersonaCreationException(
                        PersonaCreationErrorCode.SERVER_ERROR,
                        true,
                        "server error"));

        dispatcher.dispatchAvailable();

        verify(states).fail(
                generation.id(),
                PersonaCreationErrorCode.SERVER_ERROR.name(),
                null);
    }

    private static PersonaGeneration processing(
            PersonaGenerationId generationId,
            SurveyResponseId responseId,
            int attemptCount
    ) {
        PersonaGeneration generation = PersonaGeneration.pending(
                generationId, new PersonaSourceId(responseId.value()),
                NOW.minusSeconds(100));
        for (int attempt = 1; attempt <= attemptCount; attempt++) {
            Instant started = NOW.minusSeconds(90 - attempt * 10L);
            generation.startProcessing(started);
            if (attempt < attemptCount) {
                Instant failed = started.plusSeconds(1);
                generation.fail(
                        "TIMEOUT", failed, failed.plusSeconds(1));
            }
        }
        return generation;
    }

    private static PersonaSurveySource source(SurveyResponseId responseId) {
        return new PersonaSurveySource(
                responseId,
                new SurveyUserId("user-a"),
                new SurveyRoundId(UUID.randomUUID()),
                new SurveyRoundNumber(1),
                new SurveyContentVersionId(UUID.randomUUID()),
                new SurveyContentVersionNumber(1),
                NOW.minusSeconds(100),
                List.of());
    }

    private static PersonaSurveySource source(PersonaSourceId sourceId) {
        return source(new SurveyResponseId(sourceId.value()));
    }

    private static PersonaSourceId sourceId(SurveyResponseId responseId) {
        return new PersonaSourceId(responseId.value());
    }

    private static PersonaGenerationProperties properties() {
        PersonaGenerationProperties result =
                new PersonaGenerationProperties();
        result.setBatchSize(1);
        result.setMaxAttempts(3);
        result.setRetryInitialDelay(Duration.ofSeconds(30));
        return result;
    }

    private static PersonaGenerationId generationId() {
        return new PersonaGenerationId(UUID.randomUUID());
    }

    private static SurveyResponseId responseId() {
        return new SurveyResponseId(UUID.randomUUID());
    }
}
