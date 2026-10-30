package com.hamcheeze.vote.survey.application.bootstrap;

public final class LocalSurveyBootstrapException
        extends IllegalStateException {

    public static final String CODE = "LOCAL_SURVEY_BOOTSTRAP_CONFLICT";

    public LocalSurveyBootstrapException(String detail) {
        super(CODE + ": " + detail);
        if (detail == null || detail.isBlank()) {
            throw new IllegalArgumentException("detail must not be blank");
        }
    }
}
