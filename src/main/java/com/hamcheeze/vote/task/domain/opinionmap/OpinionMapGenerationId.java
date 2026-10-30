package com.hamcheeze.vote.task.domain.opinionmap;

import java.util.Objects;
import java.util.UUID;

public record OpinionMapGenerationId(UUID value) {

    public OpinionMapGenerationId {
        Objects.requireNonNull(value, "value");
    }
}
