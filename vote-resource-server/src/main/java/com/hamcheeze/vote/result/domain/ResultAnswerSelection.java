package com.hamcheeze.vote.result.domain;

import java.util.Objects;
import java.util.UUID;

public record ResultAnswerSelection(
        UUID optionId,
        String otherText
) {

    public ResultAnswerSelection {
        Objects.requireNonNull(optionId, "optionId");
    }
}
