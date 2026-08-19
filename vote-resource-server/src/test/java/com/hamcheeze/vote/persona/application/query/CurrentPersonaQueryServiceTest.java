package com.hamcheeze.vote.persona.application.query;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus.Status;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static com.hamcheeze.vote.persona.application.CurrentPersonaStatus.Capability;

class CurrentPersonaQueryServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-14T00:00:00Z");
    private static final PersonaUserId USER = new PersonaUserId("user-a");

    private final PersonaSurveySourceQueryPort sources =
            mock(PersonaSurveySourceQueryPort.class);
    private final PersonaGenerationRepository generations =
            mock(PersonaGenerationRepository.class);
    private final CurrentPersonaQueryService service =
            new CurrentPersonaQueryService(sources, generations);

    @Test
    void noResponseMeansPersonaIsNotReady() {
        when(sources.findLatestSourceIdByUserId(USER))
                .thenReturn(Optional.empty());

        var result = service.findCurrent(USER);

        assertThat(result.status()).isEqualTo(Status.NOT_SUBMITTED);
        assertThat(result.personaReady()).isFalse();
        assertThat(result.capabilities()).isEmpty();
    }

    @Test
    void onlyTheLatestResponseGenerationCanBecomeCurrent() {
        PersonaSourceId latestSourceId = sourceId();
        when(sources.findLatestSourceIdByUserId(USER))
                .thenReturn(Optional.of(latestSourceId));
        PersonaGeneration pending = PersonaGeneration.pending(
                generationId(), PersonaSourceType.SURVEY_RESPONSE,
                latestSourceId, NOW);
        when(generations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE, latestSourceId))
                .thenReturn(Optional.of(pending));

        var result = service.findCurrent(USER);

        assertThat(result.status()).isEqualTo(Status.PENDING);
        assertThat(result.personaReady()).isFalse();
        assertThat(result.personaId()).isEmpty();
        assertThat(result.capabilities()).doesNotContain(
                Capability.USE_PERSONALIZED_SERVICE);
    }

    @Test
    void succeededLatestGenerationEnablesPersonalizedCapability() {
        PersonaSourceId latestSourceId = sourceId();
        when(sources.findLatestSourceIdByUserId(USER))
                .thenReturn(Optional.of(latestSourceId));
        PersonaGeneration succeeded = PersonaGeneration.pending(
                generationId(), PersonaSourceType.SURVEY_RESPONSE,
                latestSourceId, NOW);
        succeeded.startProcessing(NOW.plusSeconds(1));
        succeeded.succeed(
                new PersonaId("persona-current"), NOW.plusSeconds(2));
        when(generations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE, latestSourceId))
                .thenReturn(Optional.of(succeeded));

        var result = service.findCurrent(USER);

        assertThat(result.status()).isEqualTo(Status.SUCCEEDED);
        assertThat(result.personaReady()).isTrue();
        assertThat(result.personaId()).contains(
                new PersonaId("persona-current"));
        assertThat(result.capabilities()).containsExactly(
                Capability.USE_PERSONALIZED_SERVICE);
    }

    private static PersonaSourceId sourceId() {
        return new PersonaSourceId(UUID.randomUUID());
    }

    private static PersonaGenerationId generationId() {
        return new PersonaGenerationId(UUID.randomUUID());
    }

}
