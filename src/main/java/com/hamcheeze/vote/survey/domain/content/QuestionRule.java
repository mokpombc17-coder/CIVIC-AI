package com.hamcheeze.vote.survey.domain.content;

public sealed interface QuestionRule permits SingleChoiceRule,
        MultipleChoiceRule, ShortTextRule, LongTextRule, NumberRule,
        ScaleRule, MatrixSingleChoiceRule, MatrixScaleRule {

    SurveyQuestionType questionType();
}
