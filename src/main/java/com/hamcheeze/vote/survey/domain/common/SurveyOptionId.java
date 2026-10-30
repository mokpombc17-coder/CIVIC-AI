package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyOptionId(UUID value) implements SurveyId {

    public SurveyOptionId {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_OPTION_ID_REQUIRED",
                "optionId");
    }
}
