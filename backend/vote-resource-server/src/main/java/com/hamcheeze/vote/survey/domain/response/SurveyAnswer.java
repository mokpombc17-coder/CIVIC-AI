package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;

public sealed interface SurveyAnswer permits SingleChoiceAnswer,
        MultipleChoiceAnswer, ShortTextAnswer, LongTextAnswer,
        NumberAnswer, ScaleAnswer, MatrixSingleChoiceAnswer,
        MatrixScaleAnswer {

    SurveyQuestionId questionId();

    SurveyAnswerType answerType();
}
