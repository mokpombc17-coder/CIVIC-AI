package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyQuestionId(UUID value) implements SurveyId {

    public SurveyQuestionId {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_QUESTION_ID_REQUIRED",
                "questionId");
    }
}
