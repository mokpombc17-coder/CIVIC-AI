package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyQuestionItemId;

import java.util.Objects;

public record MatrixScaleItemAnswer(
        SurveyQuestionItemId itemId,
        Integer value
) {

    public MatrixScaleItemAnswer {
        Objects.requireNonNull(itemId, "itemId");
    }
}
