package com.hamcheeze.vote.opinionmap.infra.integration;

import com.hamcheeze.vote.opinionmap.domain.OpinionMapOptionCount;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshotManifest;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapTaskClosureType;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.opinionmap.OpinionMapSnapshotFinalizedV1;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpinionMapSnapshotFinalizedOutboxPublisherTest {

    private static final UUID SNAPSHOT_ID = uuid(1);
    private static final UUID TASK_ID = uuid(2);
    private static final UUID OPTION_ID = uuid(3);
    private static final Instant CLOSED_AT = Instant.parse(
            "2026-08-19T01:00:00.123456Z");
    private static final Instant FINALIZED_AT = Instant.parse(
            "2026-08-19T01:01:00.654321Z");

    private final IntegrationOutboxRepository outbox =
            mock(IntegrationOutboxRepository.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final OpinionMapSnapshotFinalizedOutboxPublisher publisher =
            new OpinionMapSnapshotFinalizedOutboxPublisher(
                    outbox, objectMapper);

    @Test
    void writesCompleteV1ContractAsPendingOutboxEvent() throws Exception {
        when(outbox.findByEventId(any())).thenReturn(Optional.empty());

        publisher.publish(snapshot(), manifest());

        ArgumentCaptor<IntegrationOutboxMessage> captured =
                ArgumentCaptor.forClass(IntegrationOutboxMessage.class);
        verify(outbox).insert(captured.capture());
        IntegrationOutboxMessage message = captured.getValue();
        assertThat(message.nextAttemptAt()).isEqualTo(FINALIZED_AT);
        assertThat(message.event()).satisfies(event -> {
            assertThat(event.eventId()).isEqualTo(
                    OpinionMapSnapshotFinalizedOutboxPublisher.eventId(
                            SNAPSHOT_ID));
            assertThat(event.eventType()).isEqualTo(
                    OpinionMapSnapshotFinalizedV1.EVENT_TYPE);
            assertThat(event.schemaVersion()).isEqualTo(1);
            assertThat(event.aggregateType()).isEqualTo(
                    OpinionMapSnapshotFinalizedV1.AGGREGATE_TYPE);
            assertThat(event.aggregateId()).isEqualTo(SNAPSHOT_ID);
            assertThat(event.occurredAt()).isEqualTo(FINALIZED_AT);
        });
        OpinionMapSnapshotFinalizedV1 payload = objectMapper.readValue(
                message.event().payload(),
                OpinionMapSnapshotFinalizedV1.class);
        assertThat(payload.snapshotId()).isEqualTo(SNAPSHOT_ID);
        assertThat(payload.taskId()).isEqualTo(TASK_ID);
        assertThat(payload.responseHashFormat()).isEqualTo(
                OpinionMapSnapshotManifest.HASH_FORMAT_V1);
        assertThat(payload.responseHashSha256()).isEqualTo("a".repeat(64));
        assertThat(payload.optionCounts()).containsExactly(
                new OpinionMapSnapshotFinalizedV1.OptionCount(
                        OPTION_ID, 2));
    }

    @Test
    void deterministicEventIdMakesReplayIdempotent() {
        when(outbox.findByEventId(any())).thenReturn(Optional.empty());
        publisher.publish(snapshot(), manifest());
        ArgumentCaptor<IntegrationOutboxMessage> captured =
                ArgumentCaptor.forClass(IntegrationOutboxMessage.class);
        verify(outbox).insert(captured.capture());
        IntegrationOutboxMessage existing = captured.getValue();
        when(outbox.findByEventId(existing.event().eventId()))
                .thenReturn(Optional.of(existing));

        publisher.publish(snapshot(), manifest());

        verify(outbox, times(1)).insert(any());
    }

    @Test
    void rejectsDeterministicEventIdWithDifferentFacts() {
        IntegrationEventEnvelope conflicting = new IntegrationEventEnvelope(
                OpinionMapSnapshotFinalizedOutboxPublisher.eventId(SNAPSHOT_ID),
                OpinionMapSnapshotFinalizedV1.EVENT_TYPE,
                1,
                FINALIZED_AT,
                OpinionMapSnapshotFinalizedV1.AGGREGATE_TYPE,
                SNAPSHOT_ID,
                "{}");
        when(outbox.findByEventId(conflicting.eventId()))
                .thenReturn(Optional.of(IntegrationOutboxMessage.pending(
                        conflicting, FINALIZED_AT)));

        assertThatThrownBy(() -> publisher.publish(snapshot(), manifest()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("different facts");
    }

    private static OpinionMapSnapshot snapshot() {
        return new OpinionMapSnapshot(
                SNAPSHOT_ID,
                TASK_ID,
                OpinionMapTaskClosureType.EARLY_CLOSED,
                CLOSED_AT,
                2,
                2,
                FINALIZED_AT);
    }

    private static OpinionMapSnapshotManifest manifest() {
        return new OpinionMapSnapshotManifest(
                SNAPSHOT_ID,
                OpinionMapSnapshotManifest.HASH_FORMAT_V1,
                "a".repeat(64),
                2,
                List.of(new OpinionMapOptionCount(OPTION_ID, 2)));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13160000-0000-0000-0000-%012d".formatted(suffix));
    }
}
