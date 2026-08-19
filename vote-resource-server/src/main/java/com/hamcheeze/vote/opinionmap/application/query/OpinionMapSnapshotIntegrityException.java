package com.hamcheeze.vote.opinionmap.application.query;

import java.util.UUID;

public final class OpinionMapSnapshotIntegrityException
        extends RuntimeException {

    public OpinionMapSnapshotIntegrityException(
            UUID snapshotId,
            String reason
    ) {
        super("opinion map snapshot integrity failure ["
                + snapshotId + "]: " + reason);
    }
}
