package com.hamcheeze.vote.task.domain.answer;

import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

import java.util.Objects;

public record SingleChoiceValue(TaskOptionSelection selection)
        implements TaskAnswerValue {
    public SingleChoiceValue {
        Objects.requireNonNull(selection, "selection");
    }

    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.SINGLE_CHOICE;
    }
}
