package com.hamcheeze.vote.persona.application.integration;

import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.application.PersonaSurveySourceErrorCode;
import com.hamcheeze.vote.persona.application.PersonaSurveySourceException;
import com.hamcheeze.vote.persona.application.port.in.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaInboxRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.shared.application.UserTransactionLock;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumer;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumptionException;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.survey.SurveyResponseSubmittedV1;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;

@Component
public class PersonaSurveyResponseSubmittedConsumer
        implements IntegrationEventConsumer {

    public static final String CONSUMER_NAME = "persona-generation-v1";

    private final PersonaInboxRepository inbox;
    private final PersonaGenerationRepository generations;
    private final PersonaSurveySourceQueryPort sources;
    private final UserTransactionLock userTransactions;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public PersonaSurveyResponseSubmittedConsumer(
            PersonaInboxRepository inbox,
            PersonaGenerationRepository generations,
            PersonaSurveySourceQueryPort sources,
            UserTransactionLock userTransactions,
            ObjectMapper objectMapper
    ) {
        this(inbox, generations, sources, userTransactions, objectMapper,
                Clock.systemUTC());
    }

    PersonaSurveyResponseSubmittedConsumer(
            PersonaInboxRepository inbox,
            PersonaGenerationRepository generations,
            PersonaSurveySourceQueryPort sources,
            UserTransactionLock userTransactions,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this.inbox = Objects.requireNonNull(inbox, "inbox");
        this.generations = Objects.requireNonNull(
                generations, "generations");
        this.sources = Objects.requireNonNull(sources, "sources");
        this.userTransactions = Objects.requireNonNull(
                userTransactions, "userTransactions");
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Override
    public String consumerName() {
        return CONSUMER_NAME;
    }

    @Override
    public String eventType() {
        return SurveyResponseSubmittedV1.EVENT_TYPE;
    }

    @Override
    @Transactional
    public void consume(IntegrationEventEnvelope event) {
        Objects.requireNonNull(event, "event");
        validateEnvelope(event);
        SurveyResponseSubmittedV1 payload = decodePayload(event);
        if (!event.aggregateId().equals(payload.responseId())) {
            throw nonRetryable(
                    "PERSONA_EVENT_AGGREGATE_MISMATCH",
                    "event aggregateId does not match payload responseId");
        }

        userTransactions.lock(payload.userId());
        boolean firstDelivery = inbox.recordIfAbsent(
                new PersonaInboxReceipt(
                        CONSUMER_NAME,
                        event.eventId(),
                        event.eventType(),
                        clock.instant()));
        if (!firstDelivery) {
            return;
        }

        PersonaSourceId sourceId = new PersonaSourceId(payload.responseId());
        PersonaSurveySource source = loadSource(sourceId);
        validateSource(payload, source);
        if (generations.findBySourceResponseId(sourceId).isPresent()) {
            return;
        }
        generations.insert(PersonaGeneration.pending(
                new PersonaGenerationId(UUID.randomUUID()),
                sourceId,
                source.submittedAt()));
    }

    private static void validateEnvelope(IntegrationEventEnvelope event) {
        if (!SurveyResponseSubmittedV1.EVENT_TYPE.equals(event.eventType())) {
            throw nonRetryable(
                    "PERSONA_EVENT_TYPE_UNSUPPORTED",
                    "unsupported event type: " + event.eventType());
        }
        if (event.schemaVersion()
                != SurveyResponseSubmittedV1.SCHEMA_VERSION) {
            throw nonRetryable(
                    "PERSONA_EVENT_SCHEMA_UNSUPPORTED",
                    "unsupported event schema version: "
                            + event.schemaVersion());
        }
        if (!SurveyResponseSubmittedV1.AGGREGATE_TYPE.equals(
                event.aggregateType())) {
            throw nonRetryable(
                    "PERSONA_EVENT_AGGREGATE_TYPE_UNSUPPORTED",
                    "unsupported aggregate type: " + event.aggregateType());
        }
    }

    private SurveyResponseSubmittedV1 decodePayload(
            IntegrationEventEnvelope event
    ) {
        try {
            return objectMapper.readValue(
                    event.payload(), SurveyResponseSubmittedV1.class);
        } catch (Exception exception) {
            throw new IntegrationEventConsumptionException(
                    "PERSONA_EVENT_PAYLOAD_INVALID",
                    false,
                    "survey response submitted payload is invalid",
                    exception);
        }
    }

    private PersonaSurveySource loadSource(PersonaSourceId sourceId) {
        try {
            return sources.getByResponseId(sourceId);
        } catch (PersonaSurveySourceException exception) {
            boolean retryable = exception.code()
                    == PersonaSurveySourceErrorCode
                    .PERSONA_SURVEY_SOURCE_NOT_FOUND;
            throw new IntegrationEventConsumptionException(
                    "PERSONA_EVENT_SOURCE_UNAVAILABLE",
                    retryable,
                    "survey response source is unavailable",
                    exception);
        }
    }

    private static void validateSource(
            SurveyResponseSubmittedV1 payload,
            PersonaSurveySource source
    ) {
        boolean matches = source.responseId().value()
                .equals(payload.responseId())
                && source.userId().value().equals(payload.userId())
                && source.roundId().value().equals(payload.roundId())
                && source.contentVersionId().value()
                .equals(payload.contentVersionId())
                && source.submittedAt().truncatedTo(ChronoUnit.MICROS)
                .equals(payload.submittedAt()
                        .truncatedTo(ChronoUnit.MICROS));
        if (!matches) {
            throw nonRetryable(
                    "PERSONA_EVENT_SOURCE_MISMATCH",
                    "event payload does not match survey response source");
        }
    }

    private static IntegrationEventConsumptionException nonRetryable(
            String errorCode,
            String message
    ) {
        return new IntegrationEventConsumptionException(
                errorCode, false, message);
    }
}
