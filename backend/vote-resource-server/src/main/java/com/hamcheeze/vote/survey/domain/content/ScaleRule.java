package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;

public record ScaleRule(
        int minimum,
        int maximum,
        String minimumLabel,
        String maximumLabel
) implements QuestionRule {

    public ScaleRule {
        if (minimum != 0 && minimum != 1) {
            throw SurveyDomainException.invariant(
                    "SURVEY_SCALE_MINIMUM_INVALID",
                    "rule.minimum",
                    "scale minimum must be 0 or 1");
        }
        if (maximum <= minimum
                || maximum > SurveyContentLimits.MAX_SCALE_VALUE) {
            throw SurveyDomainException.invariant(
                    "SURVEY_SCALE_MAXIMUM_INVALID",
                    "rule.maximum",
                    "scale maximum must be greater than minimum and at most "
                            + SurveyContentLimits.MAX_SCALE_VALUE);
        }
        minimumLabel = SurveyContentText.optional(
                minimumLabel,
                SurveyContentLimits.MAX_OPTION_LABEL_LENGTH,
                "SURVEY_SCALE_LABEL_TOO_LONG",
                "rule.minimumLabel");
        maximumLabel = SurveyContentText.optional(
                maximumLabel,
                SurveyContentLimits.MAX_OPTION_LABEL_LENGTH,
                "SURVEY_SCALE_LABEL_TOO_LONG",
                "rule.maximumLabel");
    }

    public static ScaleRule defaults() {
        return new ScaleRule(1, 5, null, null);
    }

    @Override
    public SurveyQuestionType questionType() {
        return SurveyQuestionType.SCALE;
    }
}
