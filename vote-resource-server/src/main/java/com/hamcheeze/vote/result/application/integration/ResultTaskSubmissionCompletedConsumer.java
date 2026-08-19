package com.hamcheeze.vote.result.application.integration;

import com.hamcheeze.vote.result.application.port.out.ResultInboxRepository;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumer;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumptionException;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Objects;

@Component
public class ResultTaskSubmissionCompletedConsumer
        implements IntegrationEventConsumer {

    public static final String CONSUMER_NAME =
            "result-task-submission-completed-v1";

    private final ResultInboxRepository inbox;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public ResultTaskSubmissionCompletedConsumer(
            ResultInboxRepository inbox,
            ObjectMapper objectMapper
    ) {
        this(inbox, objectMapper, Clock.systemUTC());
    }

    ResultTaskSubmissionCompletedConsumer(
            ResultInboxRepository inbox,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this.inbox = Objects.requireNonNull(inbox, "inbox");
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
        return TaskSubmissionCompletedV1.EVENT_TYPE;
    }

    @Override
    @Transactional
    public void consume(IntegrationEventEnvelope event) {
        Objects.requireNonNull(event, "event");
        validateEnvelope(event);
        TaskSubmissionCompletedV1 payload = decodePayload(event);
        validateCorrelation(event, payload);

        ResultInboxReceipt receipt = ResultInboxReceipt.from(
                CONSUMER_NAME, event, clock.instant());
        if (inbox.recordIfAbsent(receipt)) {
            return;
        }

        ResultInboxReceipt existing = inbox.find(
                        CONSUMER_NAME, event.eventId())
                .orElseThrow(() -> new IntegrationEventConsumptionException(
                        "RESULT_INBOX_RECEIPT_UNAVAILABLE",
                        true,
                        "result inbox receipt is unavailable after conflict"));
        if (!existing.hasSameEvent(event)) {
            throw nonRetryable(
                    "RESULT_INBOX_EVENT_CONFLICT",
                    "eventId was redelivered with different event content");
        }
    }

    private static void validateEnvelope(IntegrationEventEnvelope event) {
        if (!TaskSubmissionCompletedV1.EVENT_TYPE.equals(event.eventType())) {
            throw nonRetryable(
                    "RESULT_EVENT_TYPE_UNSUPPORTED",
                    "unsupported event type: " + event.eventType());
        }
        if (event.schemaVersion()
                != TaskSubmissionCompletedV1.SCHEMA_VERSION) {
            throw nonRetryable(
                    "RESULT_EVENT_SCHEMA_UNSUPPORTED",
                    "unsupported event schema version: "
                            + event.schemaVersion());
        }
        if (!TaskSubmissionCompletedV1.AGGREGATE_TYPE.equals(
                event.aggregateType())) {
            throw nonRetryable(
                    "RESULT_EVENT_AGGREGATE_TYPE_UNSUPPORTED",
                    "unsupported aggregate type: " + event.aggregateType());
        }
    }

    private TaskSubmissionCompletedV1 decodePayload(
            IntegrationEventEnvelope event
    ) {
        try {
            return objectMapper.readValue(
                    event.payload(), TaskSubmissionCompletedV1.class);
        } catch (Exception exception) {
            throw new IntegrationEventConsumptionException(
                    "RESULT_EVENT_PAYLOAD_INVALID",
                    false,
                    "task submission completed payload is invalid",
                    exception);
        }
    }

    private static void validateCorrelation(
            IntegrationEventEnvelope event,
            TaskSubmissionCompletedV1 payload
    ) {
        if (!event.aggregateId().equals(payload.submissionId())) {
            throw nonRetryable(
                    "RESULT_EVENT_AGGREGATE_MISMATCH",
                    "event aggregateId does not match payload submissionId");
        }
        if (!event.occurredAt().truncatedTo(ChronoUnit.MICROS).equals(
                payload.submittedAt().truncatedTo(ChronoUnit.MICROS))) {
            throw nonRetryable(
                    "RESULT_EVENT_OCCURRED_AT_MISMATCH",
                    "event occurredAt does not match payload submittedAt");
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
