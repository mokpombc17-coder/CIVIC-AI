package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;

import java.util.Objects;

public record ShortTextAnswer(
        SurveyQuestionId questionId,
        String value
) implements SurveyAnswer {

    public ShortTextAnswer {
        Objects.requireNonNull(questionId, "questionId");
    }

    @Override
    public SurveyAnswerType answerType() {
        return SurveyAnswerType.SHORT_TEXT;
    }
}
