package com.hamcheeze.vote.opinionmap.domain;

import java.util.Objects;
import java.util.UUID;

public record OpinionMapOptionCount(
        UUID optionId,
        int responseCount
) {

    public OpinionMapOptionCount {
        Objects.requireNonNull(optionId, "optionId");
        if (responseCount <= 0) {
            throw new IllegalArgumentException(
                    "responseCount must be positive");
        }
    }
}
