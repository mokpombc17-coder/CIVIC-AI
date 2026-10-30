package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyContentVersionId(UUID value) implements SurveyId {

    public SurveyContentVersionId {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_CONTENT_VERSION_ID_REQUIRED",
                "contentVersionId");
    }
}
