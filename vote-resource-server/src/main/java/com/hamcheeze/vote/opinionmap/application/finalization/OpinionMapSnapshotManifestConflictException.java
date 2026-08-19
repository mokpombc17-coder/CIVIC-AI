package com.hamcheeze.vote.opinionmap.application.finalization;

import java.util.UUID;

public final class OpinionMapSnapshotManifestConflictException
        extends RuntimeException {

    public OpinionMapSnapshotManifestConflictException(UUID snapshotId) {
        super("opinion map snapshot manifest conflicts with responses: "
                + snapshotId);
    }
}
