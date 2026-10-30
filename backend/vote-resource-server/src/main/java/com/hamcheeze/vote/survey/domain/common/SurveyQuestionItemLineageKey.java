package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyQuestionItemLineageKey(UUID value) implements SurveyId {

    public SurveyQuestionItemLineageKey {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_QUESTION_ITEM_LINEAGE_KEY_REQUIRED",
                "questionItemLineageKey");
    }
}
