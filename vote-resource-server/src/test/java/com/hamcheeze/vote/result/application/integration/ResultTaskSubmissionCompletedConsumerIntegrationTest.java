package com.hamcheeze.vote.result.application.integration;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.result.application.port.out.ResultInboxRepository;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.AnswerSource;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.AnswerType;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.AnswerV1;
import com.hamcheeze.vote.shared.infra.integration.outbox.IntegrationOutboxDeliveryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class ResultTaskSubmissionCompletedConsumerIntegrationTest {

    private static final Instant SUBMITTED_AT =
            Instant.parse("2026-08-19T00:00:00.123456Z");

    @Autowired
    private IntegrationOutboxRepository outbox;

    @Autowired
    private IntegrationOutboxDeliveryService deliveries;

    @Autowired
    private ResultInboxRepository inbox;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void deliversTaskSubmissionEventToResultAndMarksItPublished()
            throws Exception {
        TaskSubmissionCompletedV1 payload = payload();
        IntegrationEventEnvelope event = new IntegrationEventEnvelope(
                UUID.randomUUID(),
                TaskSubmissionCompletedV1.EVENT_TYPE,
                TaskSubmissionCompletedV1.SCHEMA_VERSION,
                payload.submittedAt(),
                TaskSubmissionCompletedV1.AGGREGATE_TYPE,
                payload.submissionId(),
                objectMapper.writeValueAsString(payload));
        outbox.insert(IntegrationOutboxMessage.pending(
                event, payload.submittedAt()));

        assertThat(deliveries.deliverNext()).isTrue();

        assertThat(outbox.findByEventIdForUpdate(event.eventId()))
                .get()
                .satisfies(message -> {
                    assertThat(message.published()).isTrue();
                    assertThat(message.deadLettered()).isFalse();
                    assertThat(message.publishedAt()).isNotNull();
                });
        assertThat(inbox.find(
                ResultTaskSubmissionCompletedConsumer.CONSUMER_NAME,
                event.eventId()))
                .get()
                .satisfies(receipt -> assertThat(
                        receipt.hasSameEvent(event)).isTrue());
    }

    private static TaskSubmissionCompletedV1 payload() {
        return new TaskSubmissionCompletedV1(
                "user-a",
                uuid(1), uuid(2), uuid(3), uuid(4), uuid(5),
                SUBMITTED_AT,
                List.of(new AnswerV1(
                        uuid(6),
                        AnswerType.SHORT_TEXT,
                        AnswerSource.USER_ANSWERED,
                        null,
                        "answer",
                        null,
                        null,
                        List.of())));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "130f0000-0000-0000-0000-%012d".formatted(suffix));
    }
}
