package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;

public record LongTextRule(int maxLength) implements QuestionRule {

    public LongTextRule {
        if (maxLength < 1
                || maxLength > SurveyContentLimits.MAX_LONG_TEXT_LENGTH) {
            throw SurveyDomainException.invariant(
                    "SURVEY_LONG_TEXT_MAX_LENGTH_INVALID",
                    "rule.maxLength",
                    "long text maxLength must be between 1 and "
                            + SurveyContentLimits.MAX_LONG_TEXT_LENGTH);
        }
    }

    public static LongTextRule defaults() {
        return new LongTextRule(
                SurveyContentLimits.DEFAULT_LONG_TEXT_MAX_LENGTH);
    }

    @Override
    public SurveyQuestionType questionType() {
        return SurveyQuestionType.LONG_TEXT;
    }
}
