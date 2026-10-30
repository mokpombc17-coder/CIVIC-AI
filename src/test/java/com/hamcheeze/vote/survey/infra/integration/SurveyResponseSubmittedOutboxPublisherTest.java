package com.hamcheeze.vote.survey.infra.integration;

import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.survey.SurveyResponseSubmittedV1;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.response.SurveyResponseSubmitted;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SurveyResponseSubmittedOutboxPublisherTest {

    private static final Instant SUBMITTED_AT =
            Instant.parse("2026-08-19T00:00:00Z");

    private final IntegrationOutboxRepository outbox =
            mock(IntegrationOutboxRepository.class);
    private final ObjectMapper objectMapper = mock(ObjectMapper.class);
    private final SurveyResponseSubmittedOutboxPublisher publisher =
            new SurveyResponseSubmittedOutboxPublisher(outbox, objectMapper);

    @Test
    void publishesStableV1EnvelopeAsPendingOutboxMessage() throws Exception {
        SurveyUserId userId = new SurveyUserId("user-a");
        SurveyResponseSubmitted event = new SurveyResponseSubmitted(
                new SurveyResponseId(UUID.randomUUID()),
                new SurveyRoundId(UUID.randomUUID()),
                new SurveyContentVersionId(UUID.randomUUID()),
                SUBMITTED_AT);
        when(objectMapper.writeValueAsString(any()))
                .thenReturn("{\"schema\":\"fixture\"}");

        publisher.publish(userId, event);

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(objectMapper).writeValueAsString(payload.capture());
        assertThat(payload.getValue())
                .isEqualTo(new SurveyResponseSubmittedV1(
                        userId.value(),
                        event.responseId().value(),
                        event.roundId().value(),
                        event.contentVersionId().value(),
                        event.submittedAt()));

        ArgumentCaptor<IntegrationOutboxMessage> message =
                ArgumentCaptor.forClass(IntegrationOutboxMessage.class);
        verify(outbox).insert(message.capture());
        assertThat(message.getValue()).satisfies(pending -> {
            assertThat(pending.attemptCount()).isZero();
            assertThat(pending.nextAttemptAt()).isEqualTo(SUBMITTED_AT);
            assertThat(pending.published()).isFalse();
            assertThat(pending.deadLettered()).isFalse();
            assertThat(pending.event().eventType())
                    .isEqualTo(SurveyResponseSubmittedV1.EVENT_TYPE);
            assertThat(pending.event().schemaVersion())
                    .isEqualTo(SurveyResponseSubmittedV1.SCHEMA_VERSION);
            assertThat(pending.event().occurredAt()).isEqualTo(SUBMITTED_AT);
            assertThat(pending.event().aggregateType())
                    .isEqualTo(SurveyResponseSubmittedV1.AGGREGATE_TYPE);
            assertThat(pending.event().aggregateId())
                    .isEqualTo(event.responseId().value());
            assertThat(pending.event().payload())
                    .isEqualTo("{\"schema\":\"fixture\"}");
        });
    }
}
