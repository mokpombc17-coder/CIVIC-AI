package com.hamcheeze.vote.opinionmap.application.finalization;

import java.util.UUID;

public final class OpinionMapSnapshotConflictException
        extends RuntimeException {

    public OpinionMapSnapshotConflictException(UUID taskId) {
        super("opinion map snapshot conflicts with finalization: " + taskId);
    }
}
