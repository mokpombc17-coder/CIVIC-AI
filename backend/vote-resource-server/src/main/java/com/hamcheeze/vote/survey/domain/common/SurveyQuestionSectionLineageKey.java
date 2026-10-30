package com.hamcheeze.vote.survey.domain.common;

import java.util.Objects;
import java.util.UUID;

public record SurveyQuestionSectionLineageKey(UUID value)
        implements SurveyId {

    public SurveyQuestionSectionLineageKey {
        Objects.requireNonNull(value, "value");
    }
}
