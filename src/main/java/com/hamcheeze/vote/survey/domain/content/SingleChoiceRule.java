package com.hamcheeze.vote.survey.domain.content;

public record SingleChoiceRule() implements QuestionRule {

    @Override
    public SurveyQuestionType questionType() {
        return SurveyQuestionType.SINGLE_CHOICE;
    }
}
