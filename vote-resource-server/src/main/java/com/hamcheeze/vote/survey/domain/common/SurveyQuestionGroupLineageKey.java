package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyQuestionGroupLineageKey(UUID value) implements SurveyId {

    public SurveyQuestionGroupLineageKey {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_QUESTION_GROUP_LINEAGE_KEY_REQUIRED",
                "groupLineageKey");
    }
}
