package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;

public record ShortTextRule(int maxLength) implements QuestionRule {

    public ShortTextRule {
        if (maxLength < 1
                || maxLength > SurveyContentLimits.MAX_SHORT_TEXT_LENGTH) {
            throw SurveyDomainException.invariant(
                    "SURVEY_SHORT_TEXT_MAX_LENGTH_INVALID",
                    "rule.maxLength",
                    "short text maxLength must be between 1 and "
                            + SurveyContentLimits.MAX_SHORT_TEXT_LENGTH);
        }
    }

    public static ShortTextRule defaults() {
        return new ShortTextRule(
                SurveyContentLimits.DEFAULT_SHORT_TEXT_MAX_LENGTH);
    }

    @Override
    public SurveyQuestionType questionType() {
        return SurveyQuestionType.SHORT_TEXT;
    }
}
