package com.hamcheeze.vote.survey.domain.common;

public record SurveyRoundNumber(int value)
        implements Comparable<SurveyRoundNumber> {

    public SurveyRoundNumber {
        if (value < 1) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_NUMBER_INVALID",
                    "roundNumber",
                    "roundNumber must be positive");
        }
    }

    @Override
    public int compareTo(SurveyRoundNumber other) {
        return Integer.compare(value, other.value);
    }
}
