package com.hamcheeze.vote.survey.application.integration;

public class SurveyResponseSubmittedReplayException
        extends RuntimeException {

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
