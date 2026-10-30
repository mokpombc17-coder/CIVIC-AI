package com.hamcheeze.vote.task.domain.answer;

import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

import java.math.BigDecimal;
import java.util.Objects;

public record NumberValue(BigDecimal value) implements TaskAnswerValue {
    public NumberValue {
        Objects.requireNonNull(value, "value");
    }

    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.NUMBER;
    }
}
