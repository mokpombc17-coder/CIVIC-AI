package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyQuestionLineageKey(UUID value) implements SurveyId {

    public SurveyQuestionLineageKey {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_QUESTION_LINEAGE_KEY_REQUIRED",
                "questionLineageKey");
    }
}
