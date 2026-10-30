package com.hamcheeze.vote.task.domain.answer;

import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

import java.util.Objects;

public record ShortTextValue(String value) implements TaskAnswerValue {
    public ShortTextValue {
        Objects.requireNonNull(value, "value");
    }

    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.SHORT_TEXT;
    }
}
