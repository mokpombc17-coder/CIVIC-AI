package com.hamcheeze.vote.task.infra.integration;

import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.task.TaskOpinionMapFinalizationRequestedV1;
import com.hamcheeze.vote.shared.integration.task.TaskOpinionMapFinalizationRequestedV1.ClosureType;
import com.hamcheeze.vote.task.application.port.out.TaskOpinionMapFinalizationRequestedEventPublisher;
import com.hamcheeze.vote.task.application.task.TaskClosureFact;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.Objects;
import java.util.UUID;

@Component
@ConditionalOnProperty(
        prefix = "vote.task.opinion-map-finalization-outbox",
        name = "enabled",
        havingValue = "true")
public class TaskOpinionMapFinalizationRequestedOutboxPublisher
        implements TaskOpinionMapFinalizationRequestedEventPublisher {

    private final IntegrationOutboxRepository outbox;
    private final ObjectMapper objectMapper;

    public TaskOpinionMapFinalizationRequestedOutboxPublisher(
            IntegrationOutboxRepository outbox,
            ObjectMapper objectMapper
    ) {
        this.outbox = Objects.requireNonNull(outbox, "outbox");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    @Override
    public void publish(
            TaskClosureFact closureFact,
            int expectedSubmissionCount
    ) {
        Objects.requireNonNull(closureFact, "closureFact");
        TaskOpinionMapFinalizationRequestedV1 payload =
                new TaskOpinionMapFinalizationRequestedV1(
                        closureFact.taskId().value(),
                        ClosureType.valueOf(closureFact.closureType().name()),
                        closureFact.closedAt(),
                        expectedSubmissionCount);
        outbox.insert(IntegrationOutboxMessage.pending(
                envelope(payload), payload.closedAt()));
    }

    private IntegrationEventEnvelope envelope(
            TaskOpinionMapFinalizationRequestedV1 payload
    ) {
        try {
            return new IntegrationEventEnvelope(
                    UUID.randomUUID(),
                    TaskOpinionMapFinalizationRequestedV1.EVENT_TYPE,
                    TaskOpinionMapFinalizationRequestedV1.SCHEMA_VERSION,
                    payload.closedAt(),
                    TaskOpinionMapFinalizationRequestedV1.AGGREGATE_TYPE,
                    payload.taskId(),
                    objectMapper.writeValueAsString(payload));
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to serialize "
                            + "TaskOpinionMapFinalizationRequestedV1",
                    exception);
        }
    }
}
