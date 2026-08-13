package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;

import java.util.Objects;

public record ScaleAnswer(
        SurveyQuestionId questionId,
        Integer value
) implements SurveyAnswer {

    public ScaleAnswer {
        Objects.requireNonNull(questionId, "questionId");
    }

    @Override
    public SurveyAnswerType answerType() {
        return SurveyAnswerType.SCALE;
    }
}
