package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyRoundId(UUID value) implements SurveyId {

    public SurveyRoundId {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_ROUND_ID_REQUIRED",
                "roundId");
    }
}
