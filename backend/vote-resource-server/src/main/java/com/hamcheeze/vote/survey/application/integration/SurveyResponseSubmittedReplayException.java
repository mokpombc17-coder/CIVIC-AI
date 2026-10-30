package com.hamcheeze.vote.survey.application.integration;

public class SurveyResponseSubmittedReplayException
        extends RuntimeException {

    public static final String EVENT_NOT_FOUND =
            "SURVEY_RESPONSE_SUBMITTED_EVENT_NOT_FOUND";
    public static final String EVENT_TYPE_REQUIRED =
            "SURVEY_RESPONSE_SUBMITTED_EVENT_TYPE_REQUIRED";
    public static final String DEAD_LETTER_REQUIRED =
            "SURVEY_RESPONSE_SUBMITTED_DEAD_LETTER_REQUIRED";

    private final String code;

    public SurveyResponseSubmittedReplayException(
            String code,
            String message
    ) {
        super(message);
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("code must not be blank");
        }
        this.code = code;
    }

    public String code() {
        return code;
    }
}
