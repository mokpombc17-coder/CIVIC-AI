package com.hamcheeze.vote.task.domain.answer;

import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

import java.util.List;
import java.util.Objects;

public record MultipleChoiceValue(List<TaskOptionSelection> selections)
        implements TaskAnswerValue {
    public MultipleChoiceValue {
        selections = List.copyOf(
                Objects.requireNonNull(selections, "selections"));
        if (selections.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "selections must not contain null");
        }
    }

    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.MULTIPLE_CHOICE;
    }
}
