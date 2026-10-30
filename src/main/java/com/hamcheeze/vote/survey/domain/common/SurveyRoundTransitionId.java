package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyRoundTransitionId(UUID value) implements SurveyId {

    public SurveyRoundTransitionId {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_ROUND_TRANSITION_ID_REQUIRED",
                "roundTransitionId");
    }
}
