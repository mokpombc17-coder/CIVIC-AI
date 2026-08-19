package com.hamcheeze.vote.task.domain.common;

public final class TaskLimits {

    public static final int MAX_TITLE_LENGTH = 200;
    public static final int MAX_DESCRIPTION_LENGTH = 2_000;
    public static final int MAX_QUESTIONS = 1;
    public static final int MAX_QUESTION_CONTENT_LENGTH = 500;
    public static final int MAX_QUESTION_DESCRIPTION_LENGTH = 1_000;
    public static final int MAX_OPTIONS = 20;
    public static final int MAX_OPTION_CONTENT_LENGTH = 200;
    public static final int MAX_OTHER_TEXT_LENGTH = 500;
    public static final int MAX_SHORT_TEXT_LENGTH = 500;
    public static final int MAX_LONG_TEXT_LENGTH = 5_000;
    public static final int MAX_NUMBER_PRECISION = 19;
    public static final int MAX_NUMBER_SCALE = 6;
    public static final int MAX_SCALE_VALUE = 10;
    public static final int MAX_SCALE_LABEL_LENGTH = 100;
    public static final int MAX_REASON_LENGTH = 500;
    public static final int MAX_RATIONALE_LENGTH = 500;
    public static final int MAX_PERSONA_ID_LENGTH = 512;

    private TaskLimits() {
    }
}
