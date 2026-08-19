package com.hamcheeze.vote.result.application.integration;

import com.hamcheeze.vote.result.application.port.out.ResultInboxRepository;
import com.hamcheeze.vote.result.application.port.out.ResultSubmissionRepository;
import com.hamcheeze.vote.result.domain.ResultReasonSource;
import com.hamcheeze.vote.result.domain.ResultSubmission;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumptionException;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV2;
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
    private final ResultSubmissionRepository submissions =
            mock(ResultSubmissionRepository.class);
    private final ResultTaskSubmissionCompletedConsumer consumer =
            new ResultTaskSubmissionCompletedConsumer(
                    inbox,
                    submissions,
                    new ObjectMapper(),
                    Clock.fixed(PROCESSED_AT, ZoneOffset.UTC));

    @Test
    void recordsValidatedV2ReasonSnapshotInProjectionAndInbox() {
        IntegrationEventEnvelope event = event(uuid(1), "user-a");
        when(inbox.find(any(), any())).thenReturn(Optional.empty());
        when(submissions.insertIfAbsent(any())).thenReturn(true);
        when(inbox.recordIfAbsent(any())).thenReturn(true);

        consumer.consume(event);

        ArgumentCaptor<ResultSubmission> submission =
                ArgumentCaptor.forClass(ResultSubmission.class);
        verify(submissions).insertIfAbsent(submission.capture());
        assertThat(submission.getValue()).satisfies(projected -> {
            assertThat(projected.questionId()).isEqualTo(uuid(7));
            assertThat(projected.selectedOptionId()).isEqualTo(uuid(8));
            assertThat(projected.reasonSource())
                    .isEqualTo(ResultReasonSource.AI_ACCEPTED);
            assertThat(projected.acceptedPredictedReasonId())
                    .isEqualTo(uuid(9));
            assertThat(projected.finalReason()).isEqualTo("예상 이유");
        });
        ArgumentCaptor<ResultInboxReceipt> receipt =
                ArgumentCaptor.forClass(ResultInboxReceipt.class);
        verify(inbox).recordIfAbsent(receipt.capture());
        assertThat(receipt.getValue()).isEqualTo(ResultInboxReceipt.from(
                ResultTaskSubmissionCompletedConsumer.CONSUMER_NAME,
                event,
                PROCESSED_AT));
    }

    @Test
    void identicalInboxRedeliveryBackfillsMissingProjection() {
        IntegrationEventEnvelope event = event(uuid(1), "user-a");
        ResultInboxReceipt existing = ResultInboxReceipt.from(
                ResultTaskSubmissionCompletedConsumer.CONSUMER_NAME,
                event,
                PROCESSED_AT);
        when(inbox.find(
                ResultTaskSubmissionCompletedConsumer.CONSUMER_NAME,
                event.eventId())).thenReturn(Optional.of(existing));
        when(submissions.insertIfAbsent(any())).thenReturn(true);

        consumer.consume(event);

        verify(submissions).insertIfAbsent(any());
        verify(inbox, never()).recordIfAbsent(any());
    }

    @Test
    void rejectsEventIdRedeliveredWithDifferentPayload() {
        IntegrationEventEnvelope first = event(uuid(1), "user-a");
        IntegrationEventEnvelope conflicting = event(uuid(1), "user-b");
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
        verifyNoInteractions(submissions);
    }

    @Test
    void rejectsAggregateMismatchBeforeRecordingInboxReceipt() {
        IntegrationEventEnvelope valid = event(uuid(1), "user-a");
        IntegrationEventEnvelope mismatch = new IntegrationEventEnvelope(
                valid.eventId(), valid.eventType(), valid.schemaVersion(),
                valid.occurredAt(), valid.aggregateType(), uuid(99),
                valid.payload());

        assertThatThrownBy(() -> consumer.consume(mismatch))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> assertThat(exception.errorCode())
                                .isEqualTo("RESULT_EVENT_AGGREGATE_MISMATCH"));
        verifyNoInteractions(inbox, submissions);
    }

    @Test
    void rejectsV1SchemaAsNonRetryable() {
        IntegrationEventEnvelope valid = event(uuid(1), "user-a");
        IntegrationEventEnvelope v1 = new IntegrationEventEnvelope(
                valid.eventId(), valid.eventType(), 1, valid.occurredAt(),
                valid.aggregateType(), valid.aggregateId(), valid.payload());

        assertThatThrownBy(() -> consumer.consume(v1))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> {
                            assertThat(exception.errorCode()).isEqualTo(
                                    "RESULT_EVENT_SCHEMA_UNSUPPORTED");
                            assertThat(exception.retryable()).isFalse();
                        });
        verifyNoInteractions(inbox, submissions);
    }

    @Test
    void rejectsMalformedPayloadAsNonRetryable() {
        IntegrationEventEnvelope malformed = new IntegrationEventEnvelope(
                uuid(1), TaskSubmissionCompletedV2.EVENT_TYPE,
                TaskSubmissionCompletedV2.SCHEMA_VERSION, SUBMITTED_AT,
                TaskSubmissionCompletedV2.AGGREGATE_TYPE, uuid(2), "{}");

        assertThatThrownBy(() -> consumer.consume(malformed))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> assertThat(exception.errorCode())
                                .isEqualTo("RESULT_EVENT_PAYLOAD_INVALID"));
        verifyNoInteractions(inbox, submissions);
    }

    @Test
    void projectionFailureDoesNotRecordSuccessfulInboxReceipt() {
        IntegrationEventEnvelope event = event(uuid(1), "user-a");
        when(inbox.find(any(), any())).thenReturn(Optional.empty());
        when(submissions.insertIfAbsent(any())).thenThrow(
                new IllegalStateException("projection unavailable"));

        assertThatThrownBy(() -> consumer.consume(event))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("projection unavailable");
        verify(inbox, never()).recordIfAbsent(any());
    }

    private static IntegrationEventEnvelope event(
            UUID eventId,
            String userId
    ) {
        return new IntegrationEventEnvelope(
                eventId,
                TaskSubmissionCompletedV2.EVENT_TYPE,
                TaskSubmissionCompletedV2.SCHEMA_VERSION,
                SUBMITTED_AT,
                TaskSubmissionCompletedV2.AGGREGATE_TYPE,
                uuid(2),
                """
                        {"userId":"%s","submissionId":"%s",
                         "taskId":"%s","predictionId":"%s",
                         "personaGenerationId":"%s",
                         "personaVersionId":"%s","questionId":"%s",
                         "selectedOptionId":"%s",
                         "reasonSource":"AI_ACCEPTED",
                         "acceptedPredictedReasonId":"%s",
                         "finalReason":"예상 이유","submittedAt":"%s"}
                        """.formatted(
                        userId, uuid(2), uuid(3), uuid(4), uuid(5), uuid(6),
                        uuid(7), uuid(8), uuid(9), SUBMITTED_AT));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "130d0000-0000-0000-0000-%012d".formatted(suffix));
    }
}
