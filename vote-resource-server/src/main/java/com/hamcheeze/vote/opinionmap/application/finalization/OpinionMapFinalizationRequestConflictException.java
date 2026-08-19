package com.hamcheeze.vote.opinionmap.application.finalization;

import java.util.UUID;

public final class OpinionMapFinalizationRequestConflictException
        extends RuntimeException {

    public OpinionMapFinalizationRequestConflictException(UUID taskId) {
        super("task finalization was requested with different closure facts: "
                + taskId);
    }
}
