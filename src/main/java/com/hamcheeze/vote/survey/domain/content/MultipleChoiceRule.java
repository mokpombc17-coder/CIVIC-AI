package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;

public record MultipleChoiceRule(
        int minimumSelections,
        int maximumSelections
) implements QuestionRule {

    public MultipleChoiceRule {
        if (minimumSelections < 1) {
            throw SurveyDomainException.invariant(
                    "SURVEY_MULTIPLE_CHOICE_MINIMUM_INVALID",
                    "rule.minimumSelections",
                    "minimumSelections must be at least 1");
        }
        if (maximumSelections < minimumSelections
                || maximumSelections > SurveyContentLimits.MAX_OPTIONS_PER_QUESTION) {
            throw SurveyDomainException.invariant(
                    "SURVEY_MULTIPLE_CHOICE_MAXIMUM_INVALID",
                    "rule.maximumSelections",
                    "maximumSelections must be between minimumSelections and "
                            + SurveyContentLimits.MAX_OPTIONS_PER_QUESTION);
        }
    }

    @Override
    public SurveyQuestionType questionType() {
        return SurveyQuestionType.MULTIPLE_CHOICE;
    }
}
