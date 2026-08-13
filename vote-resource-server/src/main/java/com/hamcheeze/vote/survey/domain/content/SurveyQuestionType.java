package com.hamcheeze.vote.survey.domain.content;

public enum SurveyQuestionType {
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
