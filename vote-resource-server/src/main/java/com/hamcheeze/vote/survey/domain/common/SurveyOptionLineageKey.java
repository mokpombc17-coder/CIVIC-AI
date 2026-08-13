package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyOptionLineageKey(UUID value) implements SurveyId {

    public SurveyOptionLineageKey {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_OPTION_LINEAGE_KEY_REQUIRED",
                "optionLineageKey");
    }
}
