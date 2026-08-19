package com.hamcheeze.vote.survey.infra.integration;

import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.survey.SurveyResponseSubmittedV1;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseSubmittedEventPublisher;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.response.SurveyResponseSubmitted;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.Objects;
import java.util.UUID;

@Component
public class SurveyResponseSubmittedOutboxPublisher
        implements SurveyResponseSubmittedEventPublisher {

    private final IntegrationOutboxRepository outbox;
    private final ObjectMapper objectMapper;

    public SurveyResponseSubmittedOutboxPublisher(
            IntegrationOutboxRepository outbox,
            ObjectMapper objectMapper
    ) {
        this.outbox = Objects.requireNonNull(outbox, "outbox");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    @Override
    public void publish(
            SurveyUserId userId,
            SurveyResponseSubmitted event
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(event, "event");
        SurveyResponseSubmittedV1 payload = new SurveyResponseSubmittedV1(
                userId.value(),
                event.responseId().value(),
                event.roundId().value(),
                event.contentVersionId().value(),
                event.submittedAt());
        outbox.insert(IntegrationOutboxMessage.pending(
                envelope(payload),
                event.submittedAt()));
    }

    private IntegrationEventEnvelope envelope(
            SurveyResponseSubmittedV1 payload
    ) {
        try {
            return new IntegrationEventEnvelope(
                    UUID.randomUUID(),
                    SurveyResponseSubmittedV1.EVENT_TYPE,
                    SurveyResponseSubmittedV1.SCHEMA_VERSION,
                    payload.submittedAt(),
                    SurveyResponseSubmittedV1.AGGREGATE_TYPE,
                    payload.responseId(),
                    objectMapper.writeValueAsString(payload));
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to serialize SurveyResponseSubmittedV1",
                    exception);
        }
    }
}
