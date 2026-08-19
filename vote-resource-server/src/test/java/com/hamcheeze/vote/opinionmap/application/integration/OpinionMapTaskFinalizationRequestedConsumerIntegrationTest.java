package com.hamcheeze.vote.opinionmap.application.integration;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapFinalizationRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapInboxRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotManifestRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapOptionCount;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapFinalizationStatus;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.task.TaskOpinionMapFinalizationRequestedV1;
import com.hamcheeze.vote.shared.integration.task.TaskOpinionMapFinalizationRequestedV1.ClosureType;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV2;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV2.ReasonSource;
import com.hamcheeze.vote.shared.integration.opinionmap.OpinionMapSnapshotFinalizedV1;
import com.hamcheeze.vote.shared.infra.integration.outbox.IntegrationOutboxDeliveryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties =
        "vote.opinionmap.snapshot-finalized-outbox.enabled=true")
@ActiveProfiles({"local", "test"})
@Transactional
class OpinionMapTaskFinalizationRequestedConsumerIntegrationTest {

    private static final Instant CLOSED_AT = Instant.parse(
            "2026-08-19T02:00:00.123456Z");

    @Autowired
    private OpinionMapTaskFinalizationRequestedConsumer finalizationConsumer;
    @Autowired
    private OpinionMapTaskSubmissionCompletedConsumer submissionConsumer;
    @Autowired
    private OpinionMapFinalizationRepository finalizations;
    @Autowired
    private OpinionMapSnapshotRepository snapshots;
    @Autowired
    private OpinionMapSnapshotManifestRepository manifests;
    @Autowired
    private OpinionMapInboxRepository inbox;
    @Autowired
    private IntegrationOutboxRepository outbox;
    @Autowired
    private IntegrationOutboxDeliveryService deliveries;
    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void waitingRequestBecomesReadyWhenMissingProjectionArrives()
            throws Exception {
        UUID taskId = uuid(1);
        IntegrationEventEnvelope finalization = finalizationEvent(
                uuid(2), taskId, 1);

        finalizationConsumer.consume(finalization);

        assertThat(finalizations.findByTaskId(taskId))
                .get()
                .satisfies(state -> {
                    assertThat(state.status()).isEqualTo(
                            OpinionMapFinalizationStatus
                                    .WAITING_FOR_SUBMISSIONS);
                    assertThat(state.projectedSubmissionCount()).isZero();
                });
        assertThat(snapshots.findByTaskId(taskId)).isEmpty();

        IntegrationEventEnvelope submission = submissionEvent(
                uuid(3), taskId, uuid(4));
        submissionConsumer.consume(submission);
        OpinionMapSnapshot firstSnapshot = snapshots.findByTaskId(taskId)
                .orElseThrow();
        var firstManifest = manifests.findBySnapshotId(
                firstSnapshot.snapshotId()).orElseThrow();
        finalizationConsumer.consume(finalization);

        assertThat(finalizations.findByTaskId(taskId))
                .get()
                .satisfies(state -> {
                    assertThat(state.status()).isEqualTo(
                            OpinionMapFinalizationStatus.READY_TO_FINALIZE);
                    assertThat(state.projectedSubmissionCount()).isOne();
                });
        assertThat(snapshots.findByTaskId(taskId))
                .contains(firstSnapshot)
                .get()
                .satisfies(snapshot -> {
                    assertThat(snapshot.taskId()).isEqualTo(taskId);
                    assertThat(snapshot.expectedSubmissionCount()).isOne();
                    assertThat(snapshot.responseCount()).isOne();
                    assertThat(snapshot.finalizedAt())
                            .isAfterOrEqualTo(snapshot.closedAt());
                });
        assertThat(snapshots.findBySnapshotId(firstSnapshot.snapshotId()))
                .contains(firstSnapshot);
        assertThat(manifests.findBySnapshotId(firstSnapshot.snapshotId()))
                .contains(firstManifest)
                .get()
                .satisfies(manifest -> {
                    assertThat(manifest.responseHashSha256())
                            .matches("[0-9a-f]{64}");
                    assertThat(manifest.responseCount()).isOne();
                    assertThat(manifest.optionCounts()).containsExactly(
                            new OpinionMapOptionCount(uuid(4), 1));
                });
        assertThat(finalizedEventCount(firstSnapshot.snapshotId())).isOne();
        String payloadJson = jdbcTemplate.queryForObject("""
                SELECT payload
                FROM integration_outbox
                WHERE event_type = ? AND aggregate_id = ?
                """, String.class,
                OpinionMapSnapshotFinalizedV1.EVENT_TYPE,
                firstSnapshot.snapshotId());
        OpinionMapSnapshotFinalizedV1 finalizedPayload =
                objectMapper.readValue(
                        payloadJson,
                        OpinionMapSnapshotFinalizedV1.class);
        assertThat(finalizedPayload.responseHashSha256()).isEqualTo(
                firstManifest.responseHashSha256());
        assertThat(finalizedPayload.optionCounts()).containsExactly(
                new OpinionMapSnapshotFinalizedV1.OptionCount(uuid(4), 1));
        assertThat(inbox.find(
                OpinionMapTaskFinalizationRequestedConsumer.CONSUMER_NAME,
                finalization.eventId())).isPresent();
        assertThat(inbox.find(
                OpinionMapTaskSubmissionCompletedConsumer.CONSUMER_NAME,
                submission.eventId())).isPresent();
    }

    @Test
    void requestIsImmediatelyReadyWhenProjectionArrivedFirst()
            throws Exception {
        UUID taskId = uuid(11);
        submissionConsumer.consume(submissionEvent(
                uuid(12), taskId, uuid(13)));

        finalizationConsumer.consume(finalizationEvent(
                uuid(14), taskId, 1));

        assertThat(finalizations.findByTaskId(taskId))
                .get()
                .satisfies(state -> {
                    assertThat(state.status()).isEqualTo(
                            OpinionMapFinalizationStatus.READY_TO_FINALIZE);
                    assertThat(state.expectedSubmissionCount()).isOne();
                    assertThat(state.projectedSubmissionCount()).isOne();
                });
        assertThat(snapshots.findByTaskId(taskId))
                .get()
                .satisfies(snapshot -> {
                    assertThat(snapshot.expectedSubmissionCount()).isOne();
                    assertThat(snapshot.responseCount()).isOne();
                });
        OpinionMapSnapshot snapshot = snapshots.findByTaskId(taskId)
                .orElseThrow();
        assertThat(manifests.findBySnapshotId(snapshot.snapshotId()))
                .get()
                .satisfies(manifest -> {
                    assertThat(manifest.responseCount()).isOne();
                    assertThat(manifest.optionCounts()).containsExactly(
                            new OpinionMapOptionCount(uuid(13), 1));
                });
    }

    @Test
    void outboxDeliveryPublishesFinalizationRequestToOpinionMap()
            throws Exception {
        UUID taskId = uuid(21);
        IntegrationEventEnvelope event = finalizationEvent(
                uuid(22), taskId, 0);
        outbox.insert(IntegrationOutboxMessage.pending(
                event, event.occurredAt()));

        assertThat(deliveries.deliverNext()).isTrue();

        assertThat(outbox.findByEventIdForUpdate(event.eventId()))
                .get()
                .satisfies(message -> {
                    assertThat(message.published()).isTrue();
                    assertThat(message.deadLettered()).isFalse();
                });
        assertThat(finalizations.findByTaskId(taskId))
                .get()
                .extracting(state -> state.status())
                .isEqualTo(OpinionMapFinalizationStatus.READY_TO_FINALIZE);
        assertThat(snapshots.findByTaskId(taskId))
                .get()
                .satisfies(snapshot -> {
                    assertThat(snapshot.expectedSubmissionCount()).isZero();
                    assertThat(snapshot.responseCount()).isZero();
                });
        OpinionMapSnapshot snapshot = snapshots.findByTaskId(taskId)
                .orElseThrow();
        assertThat(manifests.findBySnapshotId(snapshot.snapshotId()))
                .get()
                .satisfies(manifest -> {
                    assertThat(manifest.responseCount()).isZero();
                    assertThat(manifest.optionCounts()).isEmpty();
                    assertThat(manifest.responseHashSha256())
                            .matches("[0-9a-f]{64}");
                });
    }

    private IntegrationEventEnvelope finalizationEvent(
            UUID eventId,
            UUID taskId,
            int expectedCount
    ) throws Exception {
        TaskOpinionMapFinalizationRequestedV1 payload =
                new TaskOpinionMapFinalizationRequestedV1(
                        taskId,
                        ClosureType.DEADLINE_REACHED,
                        CLOSED_AT,
                        expectedCount);
        return new IntegrationEventEnvelope(
                eventId,
                TaskOpinionMapFinalizationRequestedV1.EVENT_TYPE,
                TaskOpinionMapFinalizationRequestedV1.SCHEMA_VERSION,
                payload.closedAt(),
                TaskOpinionMapFinalizationRequestedV1.AGGREGATE_TYPE,
                payload.taskId(),
                objectMapper.writeValueAsString(payload));
    }

    private IntegrationEventEnvelope submissionEvent(
            UUID eventId,
            UUID taskId,
            UUID submissionId
    ) throws Exception {
        TaskSubmissionCompletedV2 payload = new TaskSubmissionCompletedV2(
                "user-" + submissionId,
                submissionId,
                taskId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                submissionId,
                ReasonSource.USER_WRITTEN,
                null,
                "직접 작성 이유",
                CLOSED_AT.minusSeconds(1));
        return new IntegrationEventEnvelope(
                eventId,
                TaskSubmissionCompletedV2.EVENT_TYPE,
                TaskSubmissionCompletedV2.SCHEMA_VERSION,
                payload.submittedAt(),
                TaskSubmissionCompletedV2.AGGREGATE_TYPE,
                payload.submissionId(),
                objectMapper.writeValueAsString(payload));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13110000-0000-0000-0000-%012d".formatted(suffix));
    }

    private int finalizedEventCount(UUID snapshotId) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM integration_outbox
                WHERE event_type = ? AND aggregate_id = ?
                """, Integer.class,
                OpinionMapSnapshotFinalizedV1.EVENT_TYPE,
                snapshotId);
        return java.util.Objects.requireNonNull(count, "event count");
    }
}
