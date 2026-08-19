package com.hamcheeze.vote.opinionmap.application.integration;

import com.hamcheeze.vote.opinionmap.application.finalization.OpinionMapFinalizationCoordinator;
import com.hamcheeze.vote.opinionmap.application.finalization.OpinionMapFinalizationRequestConflictException;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapInboxRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalizationRequest;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapTaskClosureType;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumptionException;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.task.TaskOpinionMapFinalizationRequestedV1;
import com.hamcheeze.vote.shared.integration.task.TaskOpinionMapFinalizationRequestedV1.ClosureType;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
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

class OpinionMapTaskFinalizationRequestedConsumerTest {

    private static final UUID TASK_ID = UUID.fromString(
            "13110000-0000-0000-0000-000000000301");
    private static final Instant CLOSED_AT = Instant.parse(
            "2026-08-19T01:00:00.123456Z");
    private static final Instant PROCESSED_AT = Instant.parse(
            "2026-08-19T01:01:00Z");

    private final OpinionMapInboxRepository inbox =
            mock(OpinionMapInboxRepository.class);
    private final OpinionMapFinalizationCoordinator finalizations =
            mock(OpinionMapFinalizationCoordinator.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final OpinionMapTaskFinalizationRequestedConsumer consumer =
            new OpinionMapTaskFinalizationRequestedConsumer(
                    inbox,
                    finalizations,
                    objectMapper,
                    Clock.fixed(PROCESSED_AT, ZoneOffset.UTC));

    @Test
    void registersValidatedRequestAndRecordsInboxReceipt() throws Exception {
        IntegrationEventEnvelope event = event(UUID.randomUUID(), 2);
        when(inbox.find(any(), any())).thenReturn(Optional.empty());
        when(inbox.recordIfAbsent(any())).thenReturn(true);

        consumer.consume(event);

        ArgumentCaptor<OpinionMapFinalizationRequest> request =
                ArgumentCaptor.forClass(
                        OpinionMapFinalizationRequest.class);
        verify(finalizations).register(request.capture());
        assertThat(request.getValue()).isEqualTo(
                new OpinionMapFinalizationRequest(
                        TASK_ID,
                        OpinionMapTaskClosureType.DEADLINE_REACHED,
                        CLOSED_AT,
                        2));
        verify(inbox).recordIfAbsent(OpinionMapInboxReceipt.from(
                OpinionMapTaskFinalizationRequestedConsumer.CONSUMER_NAME,
                event,
                PROCESSED_AT));
    }

    @Test
    void identicalInboxRedeliveryReevaluatesWithoutSecondReceipt()
            throws Exception {
        IntegrationEventEnvelope event = event(UUID.randomUUID(), 2);
        when(inbox.find(
                OpinionMapTaskFinalizationRequestedConsumer.CONSUMER_NAME,
                event.eventId())).thenReturn(Optional.of(
                        OpinionMapInboxReceipt.from(
                                OpinionMapTaskFinalizationRequestedConsumer
                                        .CONSUMER_NAME,
                                event,
                                PROCESSED_AT)));

        consumer.consume(event);

        verify(finalizations).register(any());
        verify(inbox, never()).recordIfAbsent(any());
    }

    @Test
    void conflictingRequestIsNonRetryable() throws Exception {
        IntegrationEventEnvelope event = event(UUID.randomUUID(), 3);
        when(inbox.find(any(), any())).thenReturn(Optional.empty());
        when(finalizations.register(any())).thenThrow(
                new OpinionMapFinalizationRequestConflictException(TASK_ID));

        assertThatThrownBy(() -> consumer.consume(event))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> {
                            assertThat(exception.errorCode()).isEqualTo(
                                    "OPINION_MAP_FINALIZATION_REQUEST_CONFLICT");
                            assertThat(exception.retryable()).isFalse();
                        });
        verify(inbox, never()).recordIfAbsent(any());
    }

    @Test
    void rejectsMalformedPayloadBeforeChangingState() {
        IntegrationEventEnvelope malformed = new IntegrationEventEnvelope(
                UUID.randomUUID(),
                TaskOpinionMapFinalizationRequestedV1.EVENT_TYPE,
                TaskOpinionMapFinalizationRequestedV1.SCHEMA_VERSION,
                CLOSED_AT,
                TaskOpinionMapFinalizationRequestedV1.AGGREGATE_TYPE,
                TASK_ID,
                "{}");

        assertThatThrownBy(() -> consumer.consume(malformed))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> assertThat(exception.errorCode())
                                .isEqualTo(
                                        "OPINION_MAP_FINALIZATION_EVENT_PAYLOAD_INVALID"));
        verifyNoInteractions(inbox, finalizations);
    }

    private IntegrationEventEnvelope event(UUID eventId, int expectedCount)
            throws Exception {
        TaskOpinionMapFinalizationRequestedV1 payload =
                new TaskOpinionMapFinalizationRequestedV1(
                        TASK_ID,
                        ClosureType.DEADLINE_REACHED,
                        CLOSED_AT,
                        expectedCount);
        return new IntegrationEventEnvelope(
                eventId,
                TaskOpinionMapFinalizationRequestedV1.EVENT_TYPE,
                TaskOpinionMapFinalizationRequestedV1.SCHEMA_VERSION,
                payload.closedAt(),
                TaskOpinionMapFinalizationRequestedV1.AGGREGATE_TYPE,
                payload.taskId(),
                objectMapper.writeValueAsString(payload));
    }
}
