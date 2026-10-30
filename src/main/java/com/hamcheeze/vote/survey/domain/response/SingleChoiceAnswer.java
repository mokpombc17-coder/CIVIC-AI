package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;

import java.util.Objects;

public record SingleChoiceAnswer(
        SurveyQuestionId questionId,
        OptionSelection selection
) implements SurveyAnswer {

    public SingleChoiceAnswer {
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(selection, "selection");
    }

    @Override
    public SurveyAnswerType answerType() {
        return SurveyAnswerType.SINGLE_CHOICE;
    }
}
