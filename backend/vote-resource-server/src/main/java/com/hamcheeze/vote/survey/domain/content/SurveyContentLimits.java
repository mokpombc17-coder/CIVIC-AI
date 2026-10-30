package com.hamcheeze.vote.survey.domain.content;

public final class SurveyContentLimits {

    public static final int MAX_QUESTIONS = 100;
    public static final int MAX_ITEMS_PER_QUESTION = 30;
    public static final int MAX_QUESTION_PROMPT_LENGTH = 500;
    public static final int MAX_QUESTION_DESCRIPTION_LENGTH = 1_000;
    public static final int MAX_OPTIONS_PER_QUESTION = 30;
    public static final int MAX_OPTION_LABEL_LENGTH = 200;
    public static final int MAX_OTHER_TEXT_LENGTH = 200;
    public static final int DEFAULT_SHORT_TEXT_MAX_LENGTH = 200;
    public static final int MAX_SHORT_TEXT_LENGTH = 500;
    public static final int DEFAULT_LONG_TEXT_MAX_LENGTH = 2_000;
    public static final int MAX_LONG_TEXT_LENGTH = 5_000;
    public static final int MAX_DECIMAL_SCALE = 2;
    public static final int MAX_SCALE_VALUE = 10;

    private SurveyContentLimits() {
    }
}
