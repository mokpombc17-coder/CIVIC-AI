package com.hamcheeze.vote.opinionmap.application.finalization;

import java.util.UUID;

public final class OpinionMapSnapshotAlreadyFinalizedException
        extends RuntimeException {

    public OpinionMapSnapshotAlreadyFinalizedException(UUID taskId) {
        super("opinion map snapshot is already finalized: " + taskId);
    }
}
