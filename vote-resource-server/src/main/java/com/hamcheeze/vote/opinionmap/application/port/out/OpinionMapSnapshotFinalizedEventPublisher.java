package com.hamcheeze.vote.opinionmap.application.port.out;

import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshotManifest;

public interface OpinionMapSnapshotFinalizedEventPublisher {

    void publish(
            OpinionMapSnapshot snapshot,
            OpinionMapSnapshotManifest manifest);
}
