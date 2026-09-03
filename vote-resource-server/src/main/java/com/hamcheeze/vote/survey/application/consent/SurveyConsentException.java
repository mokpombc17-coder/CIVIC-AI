package com.hamcheeze.vote.survey.application.consent;

public final class SurveyConsentException extends RuntimeException {

    private final int httpStatus;
    private final String code;

    public SurveyConsentException(
            int httpStatus,
            String code,
            String message
    ) {
        super(message);
        this.httpStatus = httpStatus;
        this.code = code;
    }

    public int httpStatus() {
        return httpStatus;
    }

    public String code() {
        return code;
    }
}
