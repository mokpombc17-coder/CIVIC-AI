package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyQuestionGroupId(UUID value) implements SurveyId {

    public SurveyQuestionGroupId {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_QUESTION_GROUP_ID_REQUIRED",
                "groupId");
    }
}
