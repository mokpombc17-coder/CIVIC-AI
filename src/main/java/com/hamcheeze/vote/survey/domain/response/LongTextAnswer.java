package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;

import java.util.Objects;

public record LongTextAnswer(
        SurveyQuestionId questionId,
        String value
) implements SurveyAnswer {

    public LongTextAnswer {
        Objects.requireNonNull(questionId, "questionId");
    }

    @Override
    public SurveyAnswerType answerType() {
        return SurveyAnswerType.LONG_TEXT;
    }
}
