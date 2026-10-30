package com.hamcheeze.vote.survey.domain.common;

import java.util.Objects;
import java.util.UUID;

public record SurveyQuestionSectionId(UUID value) implements SurveyId {

    public SurveyQuestionSectionId {
        Objects.requireNonNull(value, "value");
    }
}
