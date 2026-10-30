package com.hamcheeze.vote.task.domain.answer;

import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

import java.util.Objects;

public record LongTextValue(String value) implements TaskAnswerValue {
    public LongTextValue {
        Objects.requireNonNull(value, "value");
    }

    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.LONG_TEXT;
    }
}
