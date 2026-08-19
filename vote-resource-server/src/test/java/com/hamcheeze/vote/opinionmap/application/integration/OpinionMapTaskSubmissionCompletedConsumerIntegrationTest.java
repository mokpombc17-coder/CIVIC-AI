package com.hamcheeze.vote.opinionmap.application.integration;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapInboxRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSubmissionProjectionRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapReasonSource;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV2;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV2.ReasonSource;
import com.hamcheeze.vote.shared.infra.integration.outbox.IntegrationOutboxDeliveryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class OpinionMapTaskSubmissionCompletedConsumerIntegrationTest {

    private static final Instant SUBMITTED_AT =
            Instant.parse("2026-08-19T00:00:00.123456Z");

    @Autowired private IntegrationOutboxRepository outbox;
    @Autowired private IntegrationOutboxDeliveryService deliveries;
    @Autowired private OpinionMapInboxRepository inbox;
    @Autowired private OpinionMapSubmissionProjectionRepository submissions;
    @Autowired private ObjectMapper objectMapper;

    @Test
    void deliversV2ReasonSnapshotToResultAndMarksItPublished()
            throws Exception {
        TaskSubmissionCompletedV2 payload = new TaskSubmissionCompletedV2(
                "user-a", uuid(1), uuid(2), uuid(3), uuid(4), uuid(5),
                uuid(6), uuid(7), ReasonSource.AI_ACCEPTED, uuid(8),
                "채택 당시 예상 이유", SUBMITTED_AT);
        IntegrationEventEnvelope event = new IntegrationEventEnvelope(
                UUID.randomUUID(), TaskSubmissionCompletedV2.EVENT_TYPE,
                TaskSubmissionCompletedV2.SCHEMA_VERSION,
                payload.submittedAt(), TaskSubmissionCompletedV2.AGGREGATE_TYPE,
                payload.submissionId(), objectMapper.writeValueAsString(payload));
        outbox.insert(IntegrationOutboxMessage.pending(
                event, payload.submittedAt()));

        assertThat(deliveries.deliverNext()).isTrue();

        assertThat(outbox.findByEventIdForUpdate(event.eventId()))
                .get()
                .satisfies(message -> {
                    assertThat(message.published()).isTrue();
                    assertThat(message.deadLettered()).isFalse();
                });
        assertThat(inbox.find(
                OpinionMapTaskSubmissionCompletedConsumer.CONSUMER_NAME,
                event.eventId())).isPresent();
        assertThat(submissions.findBySubmissionId(payload.submissionId()))
                .get()
                .satisfies(submission -> {
                    assertThat(submission.taskId()).isEqualTo(payload.taskId());
                    assertThat(submission.personaGenerationId())
                            .isEqualTo(payload.personaGenerationId());
                    assertThat(submission.personaVersionId())
                            .isEqualTo(payload.personaVersionId());
                    assertThat(submission.questionId())
                            .isEqualTo(payload.questionId());
                    assertThat(submission.selectedOptionId())
                            .isEqualTo(payload.selectedOptionId());
                    assertThat(submission.reasonSource())
                            .isEqualTo(OpinionMapReasonSource.AI_ACCEPTED);
                    assertThat(submission.acceptedPredictedReasonId())
                            .isEqualTo(payload.acceptedPredictedReasonId());
                    assertThat(submission.finalReason())
                            .isEqualTo(payload.finalReason());
                });
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "130f0000-0000-0000-0000-%012d".formatted(suffix));
    }
}
