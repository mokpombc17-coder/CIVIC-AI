package com.hamcheeze.vote.survey.domain.content;

public enum SurveyQuestionType {
    SINGLE_CHOICE,
    MULTIPLE_CHOICE,
    SHORT_TEXT,
    LONG_TEXT,
    NUMBER,
    SCALE,
    MATRIX_SINGLE_CHOICE,
    MATRIX_SCALE;

    public boolean isChoice() {
        return this == SINGLE_CHOICE
                || this == MULTIPLE_CHOICE
                || this == MATRIX_SINGLE_CHOICE;
    }

    public boolean isMatrix() {
        return this == MATRIX_SINGLE_CHOICE || this == MATRIX_SCALE;
    }
}
