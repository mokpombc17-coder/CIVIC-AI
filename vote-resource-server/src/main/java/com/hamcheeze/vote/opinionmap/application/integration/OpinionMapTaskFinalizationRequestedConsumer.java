package com.hamcheeze.vote.opinionmap.application.integration;

import com.hamcheeze.vote.opinionmap.application.finalization.OpinionMapFinalizationCoordinator;
import com.hamcheeze.vote.opinionmap.application.finalization.OpinionMapFinalizationRequestConflictException;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapInboxRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalizationRequest;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapTaskClosureType;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumer;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumptionException;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.task.TaskOpinionMapFinalizationRequestedV1;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Objects;

@Component
public class OpinionMapTaskFinalizationRequestedConsumer
        implements IntegrationEventConsumer {

    public static final String CONSUMER_NAME =
            "opinionmap-task-finalization-requested-v1";

    private final OpinionMapInboxRepository inbox;
    private final OpinionMapFinalizationCoordinator finalizations;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public OpinionMapTaskFinalizationRequestedConsumer(
            OpinionMapInboxRepository inbox,
            OpinionMapFinalizationCoordinator finalizations,
            ObjectMapper objectMapper
    ) {
        this(inbox, finalizations, objectMapper, Clock.systemUTC());
    }

    OpinionMapTaskFinalizationRequestedConsumer(
            OpinionMapInboxRepository inbox,
            OpinionMapFinalizationCoordinator finalizations,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this.inbox = Objects.requireNonNull(inbox, "inbox");
        this.finalizations = Objects.requireNonNull(
                finalizations, "finalizations");
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
        return TaskOpinionMapFinalizationRequestedV1.EVENT_TYPE;
    }

    @Override
    @Transactional
    public void consume(IntegrationEventEnvelope event) {
        Objects.requireNonNull(event, "event");
        validateEnvelope(event);
        TaskOpinionMapFinalizationRequestedV1 payload = decodePayload(event);
        validateCorrelation(event, payload);

        boolean receiptAlreadyRecorded = hasRecordedReceipt(event);
        try {
            finalizations.register(mapRequest(payload));
        } catch (OpinionMapFinalizationRequestConflictException exception) {
            throw nonRetryable(
                    "OPINION_MAP_FINALIZATION_REQUEST_CONFLICT",
                    exception.getMessage());
        }
        if (!receiptAlreadyRecorded) {
            recordReceipt(event);
        }
    }

    private TaskOpinionMapFinalizationRequestedV1 decodePayload(
            IntegrationEventEnvelope event
    ) {
        try {
            return objectMapper.readValue(
                    event.payload(),
                    TaskOpinionMapFinalizationRequestedV1.class);
        } catch (Exception exception) {
            throw new IntegrationEventConsumptionException(
                    "OPINION_MAP_FINALIZATION_EVENT_PAYLOAD_INVALID",
                    false,
                    "task finalization requested payload is invalid",
                    exception);
        }
    }

    private static OpinionMapFinalizationRequest mapRequest(
            TaskOpinionMapFinalizationRequestedV1 payload
    ) {
        try {
            return new OpinionMapFinalizationRequest(
                    payload.taskId(),
                    OpinionMapTaskClosureType.fromContract(
                            payload.closureType().name()),
                    payload.closedAt(),
                    payload.expectedSubmissionCount());
        } catch (IllegalArgumentException exception) {
            throw new IntegrationEventConsumptionException(
                    "OPINION_MAP_FINALIZATION_EVENT_PAYLOAD_INVALID",
                    false,
                    "task finalization requested payload is invalid",
                    exception);
        }
    }

    private void recordReceipt(IntegrationEventEnvelope event) {
        OpinionMapInboxReceipt receipt = OpinionMapInboxReceipt.from(
                CONSUMER_NAME, event, clock.instant());
        if (inbox.recordIfAbsent(receipt)) {
            return;
        }
        OpinionMapInboxReceipt existing = inbox.find(
                        CONSUMER_NAME, event.eventId())
                .orElseThrow(() -> new IntegrationEventConsumptionException(
                        "OPINION_MAP_INBOX_RECEIPT_UNAVAILABLE",
                        true,
                        "opinion map inbox receipt is unavailable after conflict"));
        if (!existing.hasSameEvent(event)) {
            throw nonRetryable(
                    "OPINION_MAP_INBOX_EVENT_CONFLICT",
                    "eventId was redelivered with different event content");
        }
    }

    private boolean hasRecordedReceipt(IntegrationEventEnvelope event) {
        return inbox.find(CONSUMER_NAME, event.eventId())
                .map(existing -> {
                    if (!existing.hasSameEvent(event)) {
                        throw nonRetryable(
                                "OPINION_MAP_INBOX_EVENT_CONFLICT",
                                "eventId was redelivered with different "
                                        + "event content");
                    }
                    return true;
                })
                .orElse(false);
    }

    private static void validateEnvelope(IntegrationEventEnvelope event) {
        if (!TaskOpinionMapFinalizationRequestedV1.EVENT_TYPE.equals(
                event.eventType())) {
            throw nonRetryable(
                    "OPINION_MAP_FINALIZATION_EVENT_TYPE_UNSUPPORTED",
                    "unsupported event type: " + event.eventType());
        }
        if (event.schemaVersion()
                != TaskOpinionMapFinalizationRequestedV1.SCHEMA_VERSION) {
            throw nonRetryable(
                    "OPINION_MAP_FINALIZATION_EVENT_SCHEMA_UNSUPPORTED",
                    "unsupported event schema version: "
                            + event.schemaVersion());
        }
        if (!TaskOpinionMapFinalizationRequestedV1.AGGREGATE_TYPE.equals(
                event.aggregateType())) {
            throw nonRetryable(
                    "OPINION_MAP_FINALIZATION_AGGREGATE_TYPE_UNSUPPORTED",
                    "unsupported aggregate type: " + event.aggregateType());
        }
    }

    private static void validateCorrelation(
            IntegrationEventEnvelope event,
            TaskOpinionMapFinalizationRequestedV1 payload
    ) {
        if (!event.aggregateId().equals(payload.taskId())) {
            throw nonRetryable(
                    "OPINION_MAP_FINALIZATION_EVENT_AGGREGATE_MISMATCH",
                    "event aggregateId does not match payload taskId");
        }
        if (!event.occurredAt().truncatedTo(ChronoUnit.MICROS).equals(
                payload.closedAt().truncatedTo(ChronoUnit.MICROS))) {
            throw nonRetryable(
                    "OPINION_MAP_FINALIZATION_EVENT_OCCURRED_AT_MISMATCH",
                    "event occurredAt does not match payload closedAt");
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
