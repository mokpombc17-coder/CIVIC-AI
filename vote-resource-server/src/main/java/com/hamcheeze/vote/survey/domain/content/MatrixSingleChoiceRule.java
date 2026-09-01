package com.hamcheeze.vote.survey.domain.content;

public record MatrixSingleChoiceRule() implements QuestionRule {

    @Override
    public SurveyQuestionType questionType() {
        return SurveyQuestionType.MATRIX_SINGLE_CHOICE;
    }
}
