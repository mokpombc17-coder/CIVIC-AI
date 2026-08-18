package com.hamcheeze.vote.task.domain.task;

public enum TaskQuestionType {
    SINGLE_CHOICE,
    MULTIPLE_CHOICE,
    SHORT_TEXT,
    LONG_TEXT,
    NUMBER,
    SCALE;

    public boolean isChoice() {
        return this == SINGLE_CHOICE || this == MULTIPLE_CHOICE;
    }
}
