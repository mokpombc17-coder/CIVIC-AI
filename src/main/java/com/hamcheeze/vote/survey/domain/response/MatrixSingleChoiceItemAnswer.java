package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyQuestionItemId;

import java.util.Objects;

public record MatrixSingleChoiceItemAnswer(
        SurveyQuestionItemId itemId,
        OptionSelection selection
) {

    public MatrixSingleChoiceItemAnswer {
        Objects.requireNonNull(itemId, "itemId");
        Objects.requireNonNull(selection, "selection");
    }
}
