package com.hamcheeze.vote.opinionmap.infra.integration;

import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSnapshotFinalizedEventPublisher;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshotManifest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
@ConditionalOnProperty(
        prefix = "vote.opinionmap.snapshot-finalized-outbox",
        name = "enabled",
        havingValue = "false",
        matchIfMissing = true)
final class DisabledOpinionMapSnapshotFinalizedEventPublisher
        implements OpinionMapSnapshotFinalizedEventPublisher {

    @Override
    public void publish(
            OpinionMapSnapshot snapshot,
            OpinionMapSnapshotManifest manifest
    ) {
        Objects.requireNonNull(snapshot, "snapshot");
        Objects.requireNonNull(manifest, "manifest");
        // Enable after a downstream consumer or transport is available.
    }
}
