package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;

import java.math.BigDecimal;
import java.util.Objects;

public record NumberAnswer(
        SurveyQuestionId questionId,
        BigDecimal value
) implements SurveyAnswer {

    public NumberAnswer {
        Objects.requireNonNull(questionId, "questionId");
    }

    @Override
    public SurveyAnswerType answerType() {
        return SurveyAnswerType.NUMBER;
    }
}
