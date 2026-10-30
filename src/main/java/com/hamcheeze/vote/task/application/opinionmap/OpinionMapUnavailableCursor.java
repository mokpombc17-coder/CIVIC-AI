package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;

import java.time.Instant;
import java.util.Objects;

public record OpinionMapUnavailableCursor(
        Instant failedAt,
        OpinionMapGenerationId generationId
) {
    public OpinionMapUnavailableCursor {
        Objects.requireNonNull(failedAt, "failedAt");
        Objects.requireNonNull(generationId, "generationId");
    }
}
