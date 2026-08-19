package com.hamcheeze.vote.result.application.integration;

import com.hamcheeze.vote.result.application.port.out.ResultInboxRepository;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumptionException;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1;
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

class ResultTaskSubmissionCompletedConsumerTest {

    private static final Instant SUBMITTED_AT =
            Instant.parse("2026-08-19T00:00:00.123456Z");
    private static final Instant PROCESSED_AT =
            Instant.parse("2026-08-19T00:01:00.654321Z");

    private final ResultInboxRepository inbox =
            mock(ResultInboxRepository.class);
    private final ResultTaskSubmissionCompletedConsumer consumer =
            new ResultTaskSubmissionCompletedConsumer(
                    inbox,
                    new ObjectMapper(),
                    Clock.fixed(PROCESSED_AT, ZoneOffset.UTC));

    @Test
    void recordsValidatedSubmissionEventInResultInbox() {
        IntegrationEventEnvelope event = event(uuid(1), "user-a");
        when(inbox.recordIfAbsent(any())).thenReturn(true);

        consumer.consume(event);

        ArgumentCaptor<ResultInboxReceipt> receipt =
                ArgumentCaptor.forClass(ResultInboxReceipt.class);
        verify(inbox).recordIfAbsent(receipt.capture());
        assertThat(receipt.getValue()).isEqualTo(
                ResultInboxReceipt.from(
                        ResultTaskSubmissionCompletedConsumer.CONSUMER_NAME,
                        event,
                        PROCESSED_AT));
        verify(inbox, never()).find(any(), any());
    }

    @Test
    void ignoresIdenticalRedeliveryAfterVerifyingStoredEvent() {
        IntegrationEventEnvelope event = event(uuid(1), "user-a");
        ResultInboxReceipt existing = ResultInboxReceipt.from(
                ResultTaskSubmissionCompletedConsumer.CONSUMER_NAME,
                event,
                PROCESSED_AT);
        when(inbox.recordIfAbsent(any())).thenReturn(false);
        when(inbox.find(
                ResultTaskSubmissionCompletedConsumer.CONSUMER_NAME,
                event.eventId())).thenReturn(Optional.of(existing));

        consumer.consume(event);

        verify(inbox).find(
                ResultTaskSubmissionCompletedConsumer.CONSUMER_NAME,
                event.eventId());
    }

    @Test
    void rejectsEventIdRedeliveredWithDifferentPayload() {
        IntegrationEventEnvelope first = event(uuid(1), "user-a");
        IntegrationEventEnvelope conflicting = event(uuid(1), "user-b");
        when(inbox.recordIfAbsent(any())).thenReturn(false);
        when(inbox.find(
                ResultTaskSubmissionCompletedConsumer.CONSUMER_NAME,
                first.eventId())).thenReturn(Optional.of(
                        ResultInboxReceipt.from(
                                ResultTaskSubmissionCompletedConsumer
                                        .CONSUMER_NAME,
                                first,
                                PROCESSED_AT)));

        assertThatThrownBy(() -> consumer.consume(conflicting))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> {
                            assertThat(exception.errorCode()).isEqualTo(
                                    "RESULT_INBOX_EVENT_CONFLICT");
                            assertThat(exception.retryable()).isFalse();
                        });
    }

    @Test
    void rejectsAggregateMismatchBeforeRecordingInboxReceipt() {
        IntegrationEventEnvelope valid = event(uuid(1), "user-a");
        IntegrationEventEnvelope mismatch = new IntegrationEventEnvelope(
                valid.eventId(),
                valid.eventType(),
                valid.schemaVersion(),
                valid.occurredAt(),
                valid.aggregateType(),
                uuid(99),
                valid.payload());

        assertThatThrownBy(() -> consumer.consume(mismatch))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> {
                            assertThat(exception.errorCode()).isEqualTo(
                                    "RESULT_EVENT_AGGREGATE_MISMATCH");
                            assertThat(exception.retryable()).isFalse();
                        });
        verifyNoInteractions(inbox);
    }

    @Test
    void rejectsMalformedPayloadAsNonRetryable() {
        IntegrationEventEnvelope malformed = new IntegrationEventEnvelope(
                uuid(1),
                TaskSubmissionCompletedV1.EVENT_TYPE,
                TaskSubmissionCompletedV1.SCHEMA_VERSION,
                SUBMITTED_AT,
                TaskSubmissionCompletedV1.AGGREGATE_TYPE,
                uuid(2),
                "{}");

        assertThatThrownBy(() -> consumer.consume(malformed))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> {
                            assertThat(exception.errorCode()).isEqualTo(
                                    "RESULT_EVENT_PAYLOAD_INVALID");
                            assertThat(exception.retryable()).isFalse();
                        });
        verifyNoInteractions(inbox);
    }

    private static IntegrationEventEnvelope event(
            UUID eventId,
            String userId
    ) {
        return new IntegrationEventEnvelope(
                eventId,
                TaskSubmissionCompletedV1.EVENT_TYPE,
                TaskSubmissionCompletedV1.SCHEMA_VERSION,
                SUBMITTED_AT,
                TaskSubmissionCompletedV1.AGGREGATE_TYPE,
                uuid(2),
                """
                        {"userId":"%s","submissionId":"%s",
                         "taskId":"%s","predictionId":"%s",
                         "personaGenerationId":"%s",
                         "personaVersionId":"%s",
                         "submittedAt":"%s","answers":[{
                           "questionId":"%s","answerType":"SHORT_TEXT",
                           "source":"USER_ANSWERED",
                           "adoptedPredictionCandidateId":null,
                           "textValue":"answer","numberValue":null,
                           "scaleValue":null,"selections":[]}]}
                        """.formatted(
                        userId,
                        uuid(2), uuid(3), uuid(4), uuid(5), uuid(6),
                        SUBMITTED_AT, uuid(7)));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "130d0000-0000-0000-0000-%012d".formatted(suffix));
    }
}
