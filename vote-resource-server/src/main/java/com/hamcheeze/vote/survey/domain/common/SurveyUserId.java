package com.hamcheeze.vote.survey.domain.common;

public record SurveyUserId(String value) {

    public SurveyUserId {
        if (value == null || value.isBlank()) {
            throw SurveyDomainException.invariant(
                    "SURVEY_USER_ID_REQUIRED",
                    "userId",
                    "userId must not be blank");
        }
        value = value.strip();
    }
}
