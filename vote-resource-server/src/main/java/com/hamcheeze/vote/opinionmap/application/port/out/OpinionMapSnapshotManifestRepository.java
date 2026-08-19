package com.hamcheeze.vote.opinionmap.application.port.out;

import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshotManifest;

import java.util.Optional;
import java.util.UUID;

public interface OpinionMapSnapshotManifestRepository {

    boolean insertIfAbsent(OpinionMapSnapshotManifest manifest);

    Optional<OpinionMapSnapshotManifest> findBySnapshotId(UUID snapshotId);
}
