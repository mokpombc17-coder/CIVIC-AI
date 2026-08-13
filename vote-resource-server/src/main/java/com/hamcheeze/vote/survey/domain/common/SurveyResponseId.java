package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyResponseId(UUID value) implements SurveyId {

    public SurveyResponseId {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_RESPONSE_ID_REQUIRED",
                "responseId");
    }
}
