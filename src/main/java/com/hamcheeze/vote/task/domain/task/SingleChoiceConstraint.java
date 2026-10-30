package com.hamcheeze.vote.task.domain.task;

public record SingleChoiceConstraint() implements TaskQuestionConstraint {
    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.SINGLE_CHOICE;
    }
}
