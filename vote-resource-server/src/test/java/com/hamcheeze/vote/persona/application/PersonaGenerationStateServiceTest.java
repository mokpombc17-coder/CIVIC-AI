package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationAttemptRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaVersionRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaModelVersion;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.PersonaVersion;
import com.hamcheeze.vote.persona.domain.PredictedAdoptionRate;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.infra.PersonaGenerationProperties;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PersonaGenerationStateServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-18T00:00:00Z");
    private static final PersonaGenerationClaimToken TOKEN =
            new PersonaGenerationClaimToken(uuid(9));

    private final PersonaGenerationRepository generations =
            mock(PersonaGenerationRepository.class);
    private final PersonaVersionRepository versions =
            mock(PersonaVersionRepository.class);
    private final PersonaGenerationAttemptRepository attempts =
            mock(PersonaGenerationAttemptRepository.class);
    private final PersonaGenerationProperties properties = properties();
    private final PersonaGenerationStateService states =
            new PersonaGenerationStateService(
                    generations, versions, attempts, properties,
                    Clock.fixed(NOW, ZoneOffset.UTC), () -> TOKEN.value());

    @Test
    void claimCreatesLeaseAndAttemptOnlyWhenWorkerStarts() {
        PersonaGeneration generation = pending();
        when(generations.findNextDispatchableForUpdate(NOW))
                .thenReturn(Optional.of(generation));

        var claim = states.claimNext("instance-a:persona-worker-1")
                .orElseThrow();

        assertThat(claim.claimToken()).isEqualTo(TOKEN);
        assertThat(claim.attemptNumber()).isEqualTo(1);
        assertThat(claim.processingStartedAt()).isEqualTo(NOW);
        assertThat(claim.leaseExpiresAt())
                .isEqualTo(NOW.plusSeconds(90));
        assertThat(generation.attemptCount()).isEqualTo(1);
        assertThat(generation.claimToken()).contains(TOKEN);
        verify(generations).save(generation);
        verify(attempts).insert(any(PersonaGenerationAttempt.class));
    }

    @Test
    void successStoresGenerationVersionAndAttemptTogether() {
        PersonaGeneration generation = processing();
        PersonaGenerationAttempt attempt = attempt(generation);
        SurveyResponseId responseId = new SurveyResponseId(
                generation.sourceId().value());
        PersonaCreationResult result = result(generation.id());
        when(generations.findByIdForUpdate(generation.id()))
                .thenReturn(Optional.of(generation));
        when(attempts.findByClaimToken(TOKEN))
                .thenReturn(Optional.of(attempt));
        when(versions.insert(any()))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var completion = states.succeed(
                generation.id(), TOKEN,
                input(generation.id(), responseId), result);

        assertThat(completion).isEqualTo(
                PersonaGenerationStateService.CompletionResult.APPLIED);
        assertThat(generation.personaId()).contains(result.personaId());
        ArgumentCaptor<PersonaVersion> version =
                ArgumentCaptor.forClass(PersonaVersion.class);
        verify(versions).insert(version.capture());
        assertThat(version.getValue().generationId())
                .isEqualTo(generation.id());
        verify(attempts).update(any(PersonaGenerationAttempt.class));
    }

    @Test
    void staleSuccessDoesNotChangeGenerationOrInsertVersion() {
        PersonaGeneration generation = processing();
        PersonaGenerationClaimToken stale =
                new PersonaGenerationClaimToken(uuid(8));
        PersonaGenerationAttempt staleAttempt =
                PersonaGenerationAttempt.processing(
                        generation.id(), 1, stale,
                        NOW.minusSeconds(120), NOW.minusSeconds(60),
                        "instance-old:worker").finish(
                        PersonaGenerationAttemptOutcome.LEASE_EXPIRED,
                        NOW.minusSeconds(50),
                        "PERSONA_PROCESSING_LEASE_EXPIRED");
        when(generations.findByIdForUpdate(generation.id()))
                .thenReturn(Optional.of(generation));
        when(attempts.findByClaimToken(stale))
                .thenReturn(Optional.of(staleAttempt));

        var completion = states.succeed(
                generation.id(), stale,
                input(generation.id(), new SurveyResponseId(
                        generation.sourceId().value())),
                result(generation.id()));

        assertThat(completion).isEqualTo(
                PersonaGenerationStateService.CompletionResult
                        .IGNORED_STALE_CLAIM);
        assertThat(generation.claimToken()).contains(TOKEN);
        verify(generations, never()).save(any());
        verify(versions, never()).insert(any());
        verify(attempts).update(any(PersonaGenerationAttempt.class));
    }

    private PersonaGeneration processing() {
        PersonaGeneration generation = pending();
        generation.claim(TOKEN, NOW.minusSeconds(5), NOW.plusSeconds(85));
        return generation;
    }

    private static PersonaGeneration pending() {
        return PersonaGeneration.pending(
                new PersonaGenerationId(uuid(1)),
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(uuid(2)),
                NOW.minusSeconds(10));
    }

    private static PersonaGenerationAttempt attempt(
            PersonaGeneration generation
    ) {
        return PersonaGenerationAttempt.processing(
                generation.id(), generation.attemptCount(), TOKEN,
                NOW.minusSeconds(5), NOW.plusSeconds(85),
                "instance-a:persona-worker-1");
    }

    private static PersonaCreationResult result(
            PersonaGenerationId generationId
    ) {
        return new PersonaCreationResult(
                generationId,
                new PersonaId("provider-persona-1"),
                new PredictedAdoptionRate(new BigDecimal("0.72")),
                new PersonaModelVersion("model-v3"));
    }

    private static PersonaSurveySource source(SurveyResponseId responseId) {
        return new PersonaSurveySource(
                new PersonaSourceId(responseId.value()),
                new PersonaUserId("user-1"), uuid(3), 1, uuid(4), 1,
                NOW.minusSeconds(20), List.of());
    }

    private static PersonaGenerationInputSnapshot input(
            PersonaGenerationId generationId,
            SurveyResponseId responseId
    ) {
        PersonaSurveySource source = source(responseId);
        return PersonaGenerationInputSnapshot.create(
                generationId,
                source.responseId(),
                source.userId(),
                PersonaCreationCommand.CURRENT_SCHEMA_VERSION,
                "{\"generationId\":\"" + generationId.value() + "\"}",
                NOW.minusSeconds(20));
    }

    private static PersonaGenerationProperties properties() {
        PersonaGenerationProperties properties =
                new PersonaGenerationProperties();
        properties.setProcessingLeaseDuration(Duration.ofSeconds(90));
        return properties;
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13060000-0000-0000-0000-%012d".formatted(suffix));
    }
}
