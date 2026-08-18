package com.hamcheeze.vote.persona.application.query;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus.Status;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceCapability;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CurrentPersonaQueryServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-14T00:00:00Z");
    private static final SurveyUserId USER = new SurveyUserId("user-a");

    private final SurveyResponseRepository responses =
            mock(SurveyResponseRepository.class);
    private final PersonaGenerationRepository generations =
            mock(PersonaGenerationRepository.class);
    private final CurrentPersonaQueryService service =
            new CurrentPersonaQueryService(responses, generations);

    @Test
    void noResponseMeansPersonaIsNotReady() {
        when(responses.findLatestByUserId(USER)).thenReturn(Optional.empty());

        var result = service.findCurrent(USER);

        assertThat(result.status()).isEqualTo(Status.NOT_SUBMITTED);
        assertThat(result.personaReady()).isFalse();
        assertThat(result.capabilities()).isEmpty();
    }

    @Test
    void onlyTheLatestResponseGenerationCanBecomeCurrent() {
        SurveyResponse latest = mock(SurveyResponse.class);
        SurveyResponseId latestResponseId = responseId();
        when(latest.id()).thenReturn(latestResponseId);
        when(responses.findLatestByUserId(USER))
                .thenReturn(Optional.of(latest));
        PersonaGeneration pending = PersonaGeneration.pending(
                generationId(), sourceId(latestResponseId), NOW);
        when(generations.findBySourceResponseId(latestResponseId))
                .thenReturn(Optional.of(pending));

        var result = service.findCurrent(USER);

        assertThat(result.status()).isEqualTo(Status.PENDING);
        assertThat(result.personaReady()).isFalse();
        assertThat(result.personaId()).isEmpty();
        assertThat(result.capabilities()).doesNotContain(
                ServiceCapability.USE_PERSONALIZED_SERVICE);
    }

    @Test
    void succeededLatestGenerationEnablesPersonalizedCapability() {
        SurveyResponse latest = mock(SurveyResponse.class);
        SurveyResponseId latestResponseId = responseId();
        when(latest.id()).thenReturn(latestResponseId);
        when(responses.findLatestByUserId(USER))
                .thenReturn(Optional.of(latest));
        PersonaGeneration succeeded = PersonaGeneration.pending(
                generationId(), sourceId(latestResponseId), NOW);
        succeeded.startProcessing(NOW.plusSeconds(1));
        succeeded.succeed(
                new PersonaId("persona-current"), NOW.plusSeconds(2));
        when(generations.findBySourceResponseId(latestResponseId))
                .thenReturn(Optional.of(succeeded));

        var result = service.findCurrent(USER);

        assertThat(result.status()).isEqualTo(Status.SUCCEEDED);
        assertThat(result.personaReady()).isTrue();
        assertThat(result.personaId()).contains(
                new PersonaId("persona-current"));
        assertThat(result.capabilities()).containsExactly(
                ServiceCapability.USE_PERSONALIZED_SERVICE);
    }

    private static SurveyResponseId responseId() {
        return new SurveyResponseId(UUID.randomUUID());
    }

    private static PersonaGenerationId generationId() {
        return new PersonaGenerationId(UUID.randomUUID());
    }

    private static PersonaSourceId sourceId(SurveyResponseId responseId) {
        return new PersonaSourceId(responseId.value());
    }
}
