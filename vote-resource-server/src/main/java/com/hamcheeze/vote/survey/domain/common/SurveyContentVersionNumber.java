package com.hamcheeze.vote.survey.domain.common;

public record SurveyContentVersionNumber(int value)
        implements Comparable<SurveyContentVersionNumber> {

    public SurveyContentVersionNumber {
        if (value < 1) {
            throw SurveyDomainException.invariant(
                    "SURVEY_CONTENT_VERSION_NUMBER_INVALID",
                    "contentVersionNumber",
                    "contentVersionNumber must be positive");
        }
    }

    @Override
    public int compareTo(SurveyContentVersionNumber other) {
        return Integer.compare(value, other.value);
    }
}
