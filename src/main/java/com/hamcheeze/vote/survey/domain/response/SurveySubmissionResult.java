package com.hamcheeze.vote.survey.domain.response;

import java.util.Objects;

public record SurveySubmissionResult(
        SurveyResponse response,
        SurveyResponseSubmitted event
) {

    public SurveySubmissionResult {
        Objects.requireNonNull(response, "response");
        Objects.requireNonNull(event, "event");
        if (!response.id().equals(event.responseId())) {
            throw new IllegalArgumentException(
                    "response and event must have the same responseId");
        }
    }
}
