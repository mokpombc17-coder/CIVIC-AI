package com.hamcheeze.vote.task.infra.integration;

import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.task.TaskOpinionMapFinalizationRequestedV1;
import com.hamcheeze.vote.shared.integration.task.TaskOpinionMapFinalizationRequestedV1.ClosureType;
import com.hamcheeze.vote.task.application.task.TaskClosureFact;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskOpinionMapFinalizationRequestedOutboxPublisherTest {

    private static final UUID TASK_ID = UUID.fromString(
            "13110000-0000-0000-0000-000000000001");
    private static final Instant CLOSED_AT = Instant.parse(
            "2026-08-19T01:02:03.123456789Z");

    private final IntegrationOutboxRepository outbox =
            mock(IntegrationOutboxRepository.class);
    private final ObjectMapper objectMapper = mock(ObjectMapper.class);
    private final TaskOpinionMapFinalizationRequestedOutboxPublisher
            publisher =
            new TaskOpinionMapFinalizationRequestedOutboxPublisher(
                    outbox, objectMapper);

    @Test
    void mapsEligibleClosureAndExpectedCountIntoPendingV1Event()
            throws Exception {
        when(objectMapper.writeValueAsString(any()))
                .thenReturn("{\"schema\":\"fixture\"}");
        TaskClosureFact closureFact = new TaskClosureFact(
                new TaskId(TASK_ID),
                TaskClosureType.EARLY_CLOSED,
                CLOSED_AT,
                true);

        publisher.publish(closureFact, 7);

        ArgumentCaptor<Object> serialized =
                ArgumentCaptor.forClass(Object.class);
        verify(objectMapper).writeValueAsString(serialized.capture());
        assertThat(serialized.getValue()).isInstanceOfSatisfying(
                TaskOpinionMapFinalizationRequestedV1.class,
                payload -> {
                    assertThat(payload.taskId()).isEqualTo(TASK_ID);
                    assertThat(payload.closureType())
                            .isEqualTo(ClosureType.EARLY_CLOSED);
                    assertThat(payload.closedAt()).isEqualTo(
                            CLOSED_AT.truncatedTo(ChronoUnit.MICROS));
                    assertThat(payload.expectedSubmissionCount())
                            .isEqualTo(7);
                });

        ArgumentCaptor<IntegrationOutboxMessage> message =
                ArgumentCaptor.forClass(IntegrationOutboxMessage.class);
        verify(outbox).insert(message.capture());
        assertThat(message.getValue()).satisfies(pending -> {
            assertThat(pending.nextAttemptAt()).isEqualTo(
                    CLOSED_AT.truncatedTo(ChronoUnit.MICROS));
            assertThat(pending.event().eventType()).isEqualTo(
                    TaskOpinionMapFinalizationRequestedV1.EVENT_TYPE);
            assertThat(pending.event().schemaVersion()).isEqualTo(
                    TaskOpinionMapFinalizationRequestedV1.SCHEMA_VERSION);
            assertThat(pending.event().aggregateType()).isEqualTo(
                    TaskOpinionMapFinalizationRequestedV1.AGGREGATE_TYPE);
            assertThat(pending.event().aggregateId()).isEqualTo(TASK_ID);
            assertThat(pending.event().payload())
                    .isEqualTo("{\"schema\":\"fixture\"}");
        });
    }
}
