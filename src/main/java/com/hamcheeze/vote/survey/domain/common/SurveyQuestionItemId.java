package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyQuestionItemId(UUID value) implements SurveyId {

    public SurveyQuestionItemId {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_QUESTION_ITEM_ID_REQUIRED",
                "questionItemId");
    }
}
