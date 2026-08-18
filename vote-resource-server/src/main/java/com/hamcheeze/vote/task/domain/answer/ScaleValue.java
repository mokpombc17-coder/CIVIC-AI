package com.hamcheeze.vote.task.domain.answer;

import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

public record ScaleValue(int value) implements TaskAnswerValue {
    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.SCALE;
    }
}
