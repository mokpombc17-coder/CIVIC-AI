package com.hamcheeze.vote.persona.application.query;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus.Status;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.PersonaGenerationRetryTrigger;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
    void latestResponseWithoutGenerationIsReportedExplicitly() {
        PersonaSourceId latestSourceId = sourceId();
        when(sources.findLatestSourceIdByUserId(USER))
                .thenReturn(Optional.of(latestSourceId));
        when(generations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE, latestSourceId))
                .thenReturn(Optional.empty());

        var result = service.findCurrent(USER);

        assertThat(result.status()).isEqualTo(Status.GENERATION_MISSING);
        assertThat(result.sourceResponseId()).contains(latestSourceId);
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
        assertThat(result.attemptCount()).isZero();
        assertThat(result.nextAttemptAt()).contains(NOW);
        assertThat(result.automaticRetryScheduled()).isFalse();
        assertThat(result.terminalFailure()).isFalse();
        assertThat(result.personaReady()).isFalse();
        assertThat(result.personaId()).isEmpty();
        assertThat(result.capabilities()).doesNotContain(
                Capability.USE_PERSONALIZED_SERVICE);
    }

    @Test
    void retryWaitAndTerminalFailureAreDistinguished() {
        PersonaSourceId latestSourceId = sourceId();
        when(sources.findLatestSourceIdByUserId(USER))
                .thenReturn(Optional.of(latestSourceId));
        PersonaGeneration failed = PersonaGeneration.pending(
                generationId(), PersonaSourceType.SURVEY_RESPONSE,
                latestSourceId, NOW);
        PersonaGenerationClaimToken token = claim(
                failed, NOW.plusSeconds(1));
        Instant retryAt = NOW.plusSeconds(30);
        failed.fail(token, "PERSONA_REMOTE_TIMEOUT",
                NOW.plusSeconds(2), retryAt);
        when(generations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE, latestSourceId))
                .thenReturn(Optional.of(failed));

        var retrying = service.findCurrent(USER);

        assertThat(retrying.status()).isEqualTo(Status.FAILED);
        assertThat(retrying.attemptCount()).isEqualTo(1);
        assertThat(retrying.nextAttemptAt()).contains(retryAt);
        assertThat(retrying.retryScheduled()).isTrue();
        assertThat(retrying.retryTrigger())
                .contains(PersonaGenerationRetryTrigger.AUTOMATIC);
        assertThat(retrying.automaticRetryScheduled()).isTrue();
        assertThat(retrying.terminalFailure()).isFalse();
        assertThat(retrying.personaReady()).isFalse();
        assertThat(retrying.capabilities()).isEmpty();

        PersonaGeneration terminal = PersonaGeneration.pending(
                generationId(), PersonaSourceType.SURVEY_RESPONSE,
                latestSourceId, NOW);
        PersonaGenerationClaimToken terminalToken = claim(
                terminal, NOW.plusSeconds(1));
        terminal.fail(terminalToken, "PERSONA_REMOTE_INVALID_RESPONSE",
                NOW.plusSeconds(2), null);
        when(generations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE, latestSourceId))
                .thenReturn(Optional.of(terminal));

        var stopped = service.findCurrent(USER);

        assertThat(stopped.status()).isEqualTo(Status.FAILED);
        assertThat(stopped.nextAttemptAt()).isEmpty();
        assertThat(stopped.automaticRetryScheduled()).isFalse();
        assertThat(stopped.terminalFailure()).isTrue();
        assertThat(stopped.personaReady()).isFalse();
        assertThat(stopped.capabilities()).isEmpty();

        Instant manualRetryAt = NOW.plusSeconds(60);
        terminal.scheduleManualRetry(manualRetryAt);
        var manual = service.findCurrent(USER);
        assertThat(manual.nextAttemptAt()).contains(manualRetryAt);
        assertThat(manual.retryScheduled()).isTrue();
        assertThat(manual.retryTrigger())
                .contains(PersonaGenerationRetryTrigger.MANUAL);
        assertThat(manual.automaticRetryScheduled()).isFalse();
        assertThat(manual.terminalFailure()).isFalse();
    }

    @Test
    void succeededLatestGenerationEnablesPersonalizedCapability() {
        PersonaSourceId latestSourceId = sourceId();
        when(sources.findLatestSourceIdByUserId(USER))
                .thenReturn(Optional.of(latestSourceId));
        PersonaGeneration succeeded = PersonaGeneration.pending(
                generationId(), PersonaSourceType.SURVEY_RESPONSE,
                latestSourceId, NOW);
        PersonaGenerationClaimToken token = claim(
                succeeded, NOW.plusSeconds(1));
        succeeded.succeed(
                token,
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

    private static PersonaGenerationClaimToken claim(
            PersonaGeneration generation,
            Instant startedAt
    ) {
        PersonaGenerationClaimToken token =
                new PersonaGenerationClaimToken(UUID.randomUUID());
        generation.claim(token, startedAt, startedAt.plusSeconds(60));
        return token;
    }

}
