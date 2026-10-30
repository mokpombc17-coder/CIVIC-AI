package com.hamcheeze.vote.persona.application.integration;

import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.application.PersonaGenerationInputSnapshot;
import com.hamcheeze.vote.persona.application.PersonaSurveySourceException;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationInputRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaInboxRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.infra.PersonaGenerationInputSnapshotFactoryAdapter;
import com.hamcheeze.vote.shared.application.UserTransactionLock;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumptionException;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.survey.SurveyResponseSubmittedV1;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PersonaSurveyResponseSubmittedConsumerTest {

    private static final Instant SUBMITTED_AT =
            Instant.parse("2026-08-18T00:00:00.123456Z");
    private static final Instant PROCESSED_AT =
            Instant.parse("2026-08-18T00:01:00Z");

    private final PersonaInboxRepository inbox =
            mock(PersonaInboxRepository.class);
    private final PersonaGenerationRepository generations =
            mock(PersonaGenerationRepository.class);
    private final PersonaGenerationInputRepository inputs =
            mock(PersonaGenerationInputRepository.class);
    private final PersonaGenerationInputSnapshotFactoryAdapter inputSnapshots =
            new PersonaGenerationInputSnapshotFactoryAdapter(
                    new ObjectMapper());
    private final PersonaSurveySourceQueryPort sources =
            mock(PersonaSurveySourceQueryPort.class);
    private final UserTransactionLock userTransactions =
            mock(UserTransactionLock.class);
    private final PersonaSurveyResponseSubmittedConsumer consumer =
            new PersonaSurveyResponseSubmittedConsumer(
                    inbox,
                    generations,
                    inputs,
                    inputSnapshots,
                    sources,
                    userTransactions,
                    new ObjectMapper(),
                    Clock.fixed(PROCESSED_AT, ZoneOffset.UTC));

    @Test
    void createsPendingGenerationAndRecordsInboxReceipt() {
        SurveyResponseSubmittedV1 payload = payload();
        IntegrationEventEnvelope event = event(uuid(5), payload);
        PersonaSurveySource source = source(payload);
        when(inbox.recordIfAbsent(any())).thenReturn(true);
        when(sources.getByResponseId(
                new PersonaSourceId(payload.responseId())))
                .thenReturn(source);
        when(generations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(payload.responseId())))
                .thenReturn(Optional.empty());

        consumer.consume(event);

        verify(userTransactions).lock(payload.userId());
        ArgumentCaptor<PersonaInboxReceipt> receipt =
                ArgumentCaptor.forClass(PersonaInboxReceipt.class);
        verify(inbox).recordIfAbsent(receipt.capture());
        assertThat(receipt.getValue()).isEqualTo(new PersonaInboxReceipt(
                PersonaSurveyResponseSubmittedConsumer.CONSUMER_NAME,
                event.eventId(),
                event.eventType(),
                PROCESSED_AT));
        ArgumentCaptor<PersonaGeneration> generation =
                ArgumentCaptor.forClass(PersonaGeneration.class);
        verify(generations).insert(generation.capture());
        assertThat(generation.getValue().sourceType())
                .isEqualTo(PersonaSourceType.SURVEY_RESPONSE);
        assertThat(generation.getValue().sourceId().value())
                .isEqualTo(payload.responseId());
        assertThat(generation.getValue().createdAt())
                .isEqualTo(source.submittedAt());
        ArgumentCaptor<PersonaGenerationInputSnapshot> input =
                ArgumentCaptor.forClass(
                        PersonaGenerationInputSnapshot.class);
        verify(inputs).insert(input.capture());
        assertThat(input.getValue().generationId())
                .isEqualTo(generation.getValue().id());
        assertThat(input.getValue().sourceId())
                .isEqualTo(generation.getValue().sourceId());
        assertThat(input.getValue().userId()).isEqualTo(source.userId());
        assertThat(input.getValue().createdAt()).isEqualTo(PROCESSED_AT);
    }

    @Test
    void duplicateDeliveryStopsAfterInboxCheck() {
        SurveyResponseSubmittedV1 payload = payload();
        IntegrationEventEnvelope event = event(uuid(5), payload);
        when(inbox.recordIfAbsent(any())).thenReturn(false);

        consumer.consume(event);

        verify(userTransactions).lock(payload.userId());
        verify(inbox).recordIfAbsent(any());
        verifyNoInteractions(sources, generations, inputs);
    }

    @Test
    void differentEventForExistingSourceRecordsReceiptWithoutNewGeneration() {
        SurveyResponseSubmittedV1 payload = payload();
        PersonaSurveySource source = source(payload);
        when(inbox.recordIfAbsent(any())).thenReturn(true);
        when(sources.getByResponseId(any(PersonaSourceId.class)))
                .thenReturn(source);
        PersonaGeneration existing = PersonaGeneration.pending(
                new PersonaGenerationId(uuid(8)),
                PersonaSourceType.SURVEY_RESPONSE,
                source.responseId(),
                source.submittedAt());
        when(generations.findBySource(
                org.mockito.ArgumentMatchers.eq(
                        PersonaSourceType.SURVEY_RESPONSE),
                any(PersonaSourceId.class)))
                .thenReturn(Optional.of(existing));
        when(inputs.findByGenerationId(existing.id())).thenReturn(
                Optional.of(inputSnapshots.create(
                        existing.id(), source, existing.createdAt())));

        consumer.consume(event(uuid(6), payload));

        verify(inbox).recordIfAbsent(any());
        verify(generations, never()).insert(any());
    }

    @Test
    void existingGenerationWithoutInputViolatesInvariant() {
        SurveyResponseSubmittedV1 payload = payload();
        PersonaSurveySource source = source(payload);
        PersonaGeneration existing = PersonaGeneration.pending(
                new PersonaGenerationId(uuid(8)),
                PersonaSourceType.SURVEY_RESPONSE,
                source.responseId(),
                source.submittedAt());
        when(inbox.recordIfAbsent(any())).thenReturn(true);
        when(sources.getByResponseId(source.responseId())).thenReturn(source);
        when(generations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE, source.responseId()))
                .thenReturn(Optional.of(existing));
        when(inputs.findByGenerationId(existing.id()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> consumer.consume(event(uuid(7), payload)))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> {
                            assertThat(exception.errorCode()).isEqualTo(
                                    "PERSONA_GENERATION_INPUT_INVARIANT_VIOLATION");
                            assertThat(exception.retryable()).isFalse();
                        });

        verify(inputs, never()).insert(any());
        verify(generations, never()).insert(any());
    }

    @Test
    void rejectsEachExistingInputMetadataMismatch() {
        SurveyResponseSubmittedV1 payload = payload();
        PersonaSurveySource source = source(payload);
        PersonaGeneration existing = PersonaGeneration.pending(
                new PersonaGenerationId(uuid(8)),
                PersonaSourceType.SURVEY_RESPONSE,
                source.responseId(),
                source.submittedAt());
        PersonaGenerationInputSnapshot valid = inputSnapshots.create(
                existing.id(), source, existing.createdAt());
        List<PersonaGenerationInputSnapshot> mismatches = List.of(
                new PersonaGenerationInputSnapshot(
                        new PersonaGenerationId(uuid(9)),
                        valid.sourceId(), valid.userId(),
                        valid.requestSchemaVersion(), valid.requestPayload(),
                        valid.requestFingerprint(), valid.createdAt()),
                new PersonaGenerationInputSnapshot(
                        valid.generationId(), new PersonaSourceId(uuid(10)),
                        valid.userId(), valid.requestSchemaVersion(),
                        valid.requestPayload(), valid.requestFingerprint(),
                        valid.createdAt()),
                new PersonaGenerationInputSnapshot(
                        valid.generationId(), valid.sourceId(),
                        new PersonaUserId("different-user"),
                        valid.requestSchemaVersion(), valid.requestPayload(),
                        valid.requestFingerprint(), valid.createdAt()));
        when(inbox.recordIfAbsent(any())).thenReturn(true);
        when(sources.getByResponseId(source.responseId())).thenReturn(source);
        when(generations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE, source.responseId()))
                .thenReturn(Optional.of(existing));
        when(inputs.findByGenerationId(existing.id())).thenReturn(
                Optional.of(mismatches.get(0)),
                Optional.of(mismatches.get(1)),
                Optional.of(mismatches.get(2)));

        for (int index = 0; index < mismatches.size(); index++) {
            IntegrationEventEnvelope mismatchedEvent = event(
                    uuid(20 + index), payload);
            assertThatThrownBy(() -> consumer.consume(mismatchedEvent))
                    .isInstanceOfSatisfying(
                            IntegrationEventConsumptionException.class,
                            exception -> assertThat(exception.errorCode())
                                    .isEqualTo(
                                            "PERSONA_GENERATION_INPUT_INVARIANT_VIOLATION"));
        }

        verify(inputs, never()).insert(any());
        verify(generations, never()).insert(any());
    }

    @Test
    void rejectsCorrelationMismatchAsNonRetryable() {
        SurveyResponseSubmittedV1 payload = payload();
        IntegrationEventEnvelope event = new IntegrationEventEnvelope(
                uuid(5),
                SurveyResponseSubmittedV1.EVENT_TYPE,
                SurveyResponseSubmittedV1.SCHEMA_VERSION,
                SUBMITTED_AT,
                SurveyResponseSubmittedV1.AGGREGATE_TYPE,
                uuid(99),
                json(payload));

        assertThatThrownBy(() -> consumer.consume(event))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> {
                            assertThat(exception.errorCode())
                                    .isEqualTo(
                                            "PERSONA_EVENT_AGGREGATE_MISMATCH");
                            assertThat(exception.retryable()).isFalse();
                        });
        verifyNoInteractions(inbox, generations, sources, userTransactions);
    }

    @Test
    void missingSurveySourceIsRetryable() {
        SurveyResponseSubmittedV1 payload = payload();
        when(inbox.recordIfAbsent(any())).thenReturn(true);
        when(sources.getByResponseId(any(PersonaSourceId.class))).thenThrow(
                PersonaSurveySourceException.notFound(
                        new PersonaSourceId(payload.responseId())));

        assertThatThrownBy(() -> consumer.consume(event(uuid(5), payload)))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> assertThat(exception.retryable()).isTrue());
        verify(generations, never()).insert(any());
    }

    private static IntegrationEventEnvelope event(
            UUID eventId,
            SurveyResponseSubmittedV1 payload
    ) {
        return new IntegrationEventEnvelope(
                eventId,
                SurveyResponseSubmittedV1.EVENT_TYPE,
                SurveyResponseSubmittedV1.SCHEMA_VERSION,
                SUBMITTED_AT,
                SurveyResponseSubmittedV1.AGGREGATE_TYPE,
                payload.responseId(),
                json(payload));
    }

    private static String json(SurveyResponseSubmittedV1 payload) {
        return """
                {"userId":"%s","responseId":"%s","roundId":"%s",
                 "contentVersionId":"%s","submittedAt":"%s"}
                """.formatted(
                payload.userId(),
                payload.responseId(),
                payload.roundId(),
                payload.contentVersionId(),
                payload.submittedAt());
    }

    private static SurveyResponseSubmittedV1 payload() {
        return new SurveyResponseSubmittedV1(
                "user-1", uuid(1), uuid(2), uuid(3), SUBMITTED_AT);
    }

    private static PersonaSurveySource source(
            SurveyResponseSubmittedV1 payload
    ) {
        return new PersonaSurveySource(
                new PersonaSourceId(payload.responseId()),
                new PersonaUserId(payload.userId()),
                payload.roundId(),
                1,
                payload.contentVersionId(),
                1,
                payload.submittedAt().plusNanos(999),
                List.of());
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13080000-0000-0000-0000-%012d".formatted(suffix));
    }
}
