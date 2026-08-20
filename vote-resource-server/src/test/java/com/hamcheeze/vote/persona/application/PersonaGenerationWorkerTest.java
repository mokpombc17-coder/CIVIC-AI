package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.application.PersonaGenerationStateService.ClaimedPersonaGeneration;
import com.hamcheeze.vote.persona.application.PersonaGenerationStateService.CompletionResult;
import com.hamcheeze.vote.persona.application.PersonaGenerationStateService.FailureResult;
import com.hamcheeze.vote.persona.application.port.out.PersonaCreationPort;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationInputRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaModelVersion;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.PredictedAdoptionRate;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.infra.PersonaGenerationMetrics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PersonaGenerationWorkerTest {

    private static final Instant NOW =
            Instant.parse("2026-08-20T00:00:00Z");

    private final PersonaGenerationStateService states =
            mock(PersonaGenerationStateService.class);
    private final PersonaGenerationInputRepository inputs =
            mock(PersonaGenerationInputRepository.class);
    private final PersonaCreationPort creation =
            mock(PersonaCreationPort.class);
    private final PersonaGenerationMetrics metrics =
            mock(PersonaGenerationMetrics.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<PersonaCreationPort> creationProvider =
            mock(ObjectProvider.class);
    private final PersonaGenerationWorker worker =
            new PersonaGenerationWorker(
                    states, inputs, creationProvider, metrics, "test-instance");

    private ClaimedPersonaGeneration claim;
    private PersonaGenerationInputSnapshot input;

    @BeforeEach
    void setUp() {
        PersonaGeneration generation = PersonaGeneration.pending(
                new PersonaGenerationId(UUID.randomUUID()),
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(UUID.randomUUID()),
                NOW);
        PersonaGenerationClaimToken token =
                new PersonaGenerationClaimToken(UUID.randomUUID());
        generation.claim(token, NOW, NOW.plusSeconds(60));
        claim = new ClaimedPersonaGeneration(
                generation, token, 1, NOW, NOW.plusSeconds(60));
        String payload = "{\"generationId\":\""
                + generation.id().value()
                + "\",\"schemaVersion\":1,\"answers\":[]}";
        input = PersonaGenerationInputSnapshot.create(
                generation.id(),
                generation.sourceId(),
                new PersonaUserId("user-a"),
                1,
                payload,
                NOW);
        when(creationProvider.getIfAvailable()).thenReturn(creation);
        when(states.claimNext(any())).thenReturn(Optional.of(claim));
        when(inputs.findByGenerationId(generation.id()))
                .thenReturn(Optional.of(input));
        when(creation.create(any())).thenReturn(new PersonaCreationResult(
                generation.id(),
                new PersonaId("persona-a"),
                new PredictedAdoptionRate(new BigDecimal("0.73")),
                new PersonaModelVersion("model-v1")));
        when(states.succeed(any(), any(), any(), any()))
                .thenReturn(CompletionResult.APPLIED);
        when(states.fail(any(), any(), any(), anyBoolean()))
                .thenReturn(new FailureResult(
                        CompletionResult.APPLIED, Optional.empty(), true));
    }

    @Test
    void sendsTheStoredExactPayloadWithoutSurveyLookupOrReserialization() {
        assertThat(worker.executeOne()).isTrue();

        ArgumentCaptor<PersonaCreationCommand> command =
                ArgumentCaptor.forClass(PersonaCreationCommand.class);
        verify(creation).create(command.capture());
        assertThat(command.getValue().generationId())
                .isEqualTo(input.generationId());
        assertThat(command.getValue().schemaVersion())
                .isEqualTo(input.requestSchemaVersion());
        assertThat(command.getValue().requestPayload())
                .isSameAs(input.requestPayload());
        assertThat(command.getValue().requestFingerprint())
                .isEqualTo(input.requestFingerprint());
        verify(states).succeed(
                eq(claim.generation().id()), eq(claim.claimToken()), eq(input),
                any(PersonaCreationResult.class));
    }

    @Test
    void everyAttemptForOneGenerationUsesTheSameSnapshotBody() {
        PersonaGenerationClaimToken retryToken =
                new PersonaGenerationClaimToken(UUID.randomUUID());
        ClaimedPersonaGeneration retryClaim =
                new ClaimedPersonaGeneration(
                        claim.generation(), retryToken, 2,
                        NOW.plusSeconds(120), NOW.plusSeconds(180));
        when(states.claimNext(any())).thenReturn(
                Optional.of(claim), Optional.of(retryClaim));

        assertThat(worker.executeOne()).isTrue();
        assertThat(worker.executeOne()).isTrue();

        ArgumentCaptor<PersonaCreationCommand> commands =
                ArgumentCaptor.forClass(PersonaCreationCommand.class);
        verify(creation, org.mockito.Mockito.times(2))
                .create(commands.capture());
        List<PersonaCreationCommand> attempts = commands.getAllValues();
        assertThat(attempts).extracting(
                        PersonaCreationCommand::generationId)
                .containsOnly(input.generationId());
        assertThat(attempts).extracting(
                        PersonaCreationCommand::schemaVersion)
                .containsOnly(input.requestSchemaVersion());
        assertThat(attempts).extracting(
                        PersonaCreationCommand::requestPayload)
                .containsOnly(input.requestPayload());
        assertThat(attempts).extracting(
                        PersonaCreationCommand::requestFingerprint)
                .containsOnly(input.requestFingerprint());
    }

    @Test
    void fingerprintMismatchNeverCallsProviderAndIsTerminal() {
        when(inputs.findByGenerationId(claim.generation().id())).thenThrow(
                new PersonaGenerationInputException(
                        PersonaGenerationInputException.ErrorCode
                                .FINGERPRINT_MISMATCH,
                        "corrupt snapshot"));

        assertThat(worker.executeOne()).isTrue();

        verify(creation, never()).create(any());
        verify(states).fail(
                claim.generation().id(),
                claim.claimToken(),
                PersonaCreationErrorCode
                        .PERSONA_GENERATION_INPUT_FINGERPRINT_MISMATCH.name(),
                false);
        verify(metrics).inputFingerprintMismatch();
    }

    @Test
    void inputMetadataMismatchNeverCallsProviderAndIsTerminal() {
        PersonaGenerationInputSnapshot mismatched =
                PersonaGenerationInputSnapshot.create(
                        input.generationId(),
                        new PersonaSourceId(UUID.randomUUID()),
                        input.userId(),
                        input.requestSchemaVersion(),
                        input.requestPayload(),
                        input.createdAt());
        when(inputs.findByGenerationId(claim.generation().id()))
                .thenReturn(Optional.of(mismatched));

        assertThat(worker.executeOne()).isTrue();

        verify(creation, never()).create(any());
        verify(states).fail(
                claim.generation().id(),
                claim.claimToken(),
                PersonaCreationErrorCode
                        .PERSONA_GENERATION_INPUT_INTEGRITY_ERROR.name(),
                false);
    }

    @ParameterizedTest
    @EnumSource(PersonaGenerationPersistenceException.ErrorCode.class)
    void classifiesEveryPersistenceFailureExhaustively(
            PersonaGenerationPersistenceException.ErrorCode errorCode
    ) {
        when(states.succeed(any(), any(), any(), any())).thenThrow(
                new PersonaGenerationPersistenceException(
                        errorCode, "forced", new IllegalStateException()));

        assertThat(worker.executeOne()).isTrue();

        String expected = switch (errorCode) {
            case SOURCE_ALREADY_LINKED ->
                    PersonaCreationErrorCode.PERSONA_SOURCE_ALREADY_LINKED
                            .name();
            case PERSONA_ID_ALREADY_LINKED ->
                    PersonaCreationErrorCode.PERSONA_ID_ALREADY_LINKED.name();
            case INTEGRITY_CONSTRAINT_VIOLATION ->
                    PersonaCreationErrorCode
                            .PERSONA_PERSISTENCE_INTEGRITY_ERROR.name();
        };
        verify(states).fail(
                claim.generation().id(), claim.claimToken(), expected, false);
        if (errorCode == PersonaGenerationPersistenceException.ErrorCode
                .INTEGRITY_CONSTRAINT_VIOLATION) {
            verify(metrics).persistenceIntegrityFailure();
        }
    }
}
