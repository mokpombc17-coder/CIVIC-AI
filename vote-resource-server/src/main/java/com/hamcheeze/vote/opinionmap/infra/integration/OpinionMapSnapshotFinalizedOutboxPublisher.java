package com.hamcheeze.vote.opinionmap.infra.integration;

import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotFinalizedEventPublisher;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshotManifest;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.opinionmap.OpinionMapSnapshotFinalizedV1;
import com.hamcheeze.vote.shared.integration.opinionmap.OpinionMapSnapshotFinalizedV1.OptionCount;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;

@Component
@ConditionalOnProperty(
        prefix = "vote.opinionmap.snapshot-finalized-outbox",
        name = "enabled",
        havingValue = "true")
public class OpinionMapSnapshotFinalizedOutboxPublisher
        implements OpinionMapSnapshotFinalizedEventPublisher {

    private static final String EVENT_ID_NAMESPACE =
            OpinionMapSnapshotFinalizedV1.EVENT_TYPE + ":v1:";

    private final IntegrationOutboxRepository outbox;
    private final ObjectMapper objectMapper;

    public OpinionMapSnapshotFinalizedOutboxPublisher(
            IntegrationOutboxRepository outbox,
            ObjectMapper objectMapper
    ) {
        this.outbox = Objects.requireNonNull(outbox, "outbox");
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
    }

    @Override
    public void publish(
            OpinionMapSnapshot snapshot,
            OpinionMapSnapshotManifest manifest
    ) {
        Objects.requireNonNull(snapshot, "snapshot");
        Objects.requireNonNull(manifest, "manifest");
        if (!snapshot.snapshotId().equals(manifest.snapshotId())
                || snapshot.responseCount() != manifest.responseCount()) {
            throw new IllegalArgumentException(
                    "snapshot and manifest must describe the same result");
        }

        IntegrationEventEnvelope event = envelope(payload(snapshot, manifest));
        outbox.findByEventId(event.eventId()).ifPresentOrElse(
                existing -> {
                    if (!existing.event().equals(event)) {
                        throw new IllegalStateException(
                                "snapshot finalized event ID conflicts with different facts");
                    }
                },
                () -> outbox.insert(IntegrationOutboxMessage.pending(
                        event, event.occurredAt())));
    }

    private static OpinionMapSnapshotFinalizedV1 payload(
            OpinionMapSnapshot snapshot,
            OpinionMapSnapshotManifest manifest
    ) {
        return new OpinionMapSnapshotFinalizedV1(
                snapshot.snapshotId(),
                snapshot.taskId(),
                OpinionMapSnapshotFinalizedV1.ClosureType.valueOf(
                        snapshot.closureType().name()),
                snapshot.closedAt(),
                snapshot.finalizedAt(),
                snapshot.expectedSubmissionCount(),
                snapshot.responseCount(),
                manifest.responseHashFormat(),
                manifest.responseHashSha256(),
                manifest.optionCounts().stream()
                        .map(count -> new OptionCount(
                                count.optionId(), count.responseCount()))
                        .toList());
    }

    private IntegrationEventEnvelope envelope(
            OpinionMapSnapshotFinalizedV1 payload
    ) {
        try {
            return new IntegrationEventEnvelope(
                    eventId(payload.snapshotId()),
                    OpinionMapSnapshotFinalizedV1.EVENT_TYPE,
                    OpinionMapSnapshotFinalizedV1.SCHEMA_VERSION,
                    payload.finalizedAt(),
                    OpinionMapSnapshotFinalizedV1.AGGREGATE_TYPE,
                    payload.snapshotId(),
                    objectMapper.writeValueAsString(payload));
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to serialize OpinionMapSnapshotFinalizedV1",
                    exception);
        }
    }

    static UUID eventId(UUID snapshotId) {
        Objects.requireNonNull(snapshotId, "snapshotId");
        return UUID.nameUUIDFromBytes(
                (EVENT_ID_NAMESPACE + snapshotId)
                        .getBytes(StandardCharsets.UTF_8));
    }
}
