package com.hamcheeze.vote.task.domain.answer;

import com.hamcheeze.vote.task.domain.common.TaskOptionId;

import java.util.Objects;
import java.util.Optional;

public record TaskOptionSelection(
        TaskOptionId optionId,
        String otherText
) {
    public TaskOptionSelection {
        Objects.requireNonNull(optionId, "optionId");
    }

    public Optional<String> optionalOtherText() {
        return Optional.ofNullable(otherText);
    }

    public TaskOptionSelection normalized(String normalizedOtherText) {
        return new TaskOptionSelection(optionId, normalizedOtherText);
    }
}
