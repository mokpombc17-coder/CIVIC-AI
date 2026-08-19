package com.hamcheeze.vote.opinionmap.application.port.out;

import com.hamcheeze.vote.opinionmap.domain.OpinionMapSnapshot;

import java.util.Optional;
import java.util.UUID;

public interface OpinionMapSnapshotRepository {

    boolean insertIfAbsent(OpinionMapSnapshot snapshot);

    Optional<OpinionMapSnapshot> findByTaskId(UUID taskId);

    Optional<OpinionMapSnapshot> findBySnapshotId(UUID snapshotId);
}
