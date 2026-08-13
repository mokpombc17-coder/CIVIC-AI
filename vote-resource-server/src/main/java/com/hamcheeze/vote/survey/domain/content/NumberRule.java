package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;

import java.math.BigDecimal;
import java.util.Objects;

public record NumberRule(
        BigDecimal minimum,
        BigDecimal maximum,
        boolean decimalAllowed,
        int decimalScale
) implements QuestionRule {

    public NumberRule {
        minimum = canonical(Objects.requireNonNull(minimum, "minimum"));
        maximum = canonical(Objects.requireNonNull(maximum, "maximum"));
        if (minimum.compareTo(maximum) > 0) {
            throw SurveyDomainException.invariant(
                    "SURVEY_NUMBER_RANGE_INVALID",
                    "rule",
                    "minimum must not be greater than maximum");
        }
        if (decimalAllowed) {
            if (decimalScale < 1
                    || decimalScale > SurveyContentLimits.MAX_DECIMAL_SCALE) {
                throw SurveyDomainException.invariant(
                        "SURVEY_NUMBER_DECIMAL_SCALE_INVALID",
                        "rule.decimalScale",
                        "decimalScale must be between 1 and "
                                + SurveyContentLimits.MAX_DECIMAL_SCALE);
            }
            if (fractionDigits(minimum) > decimalScale
                    || fractionDigits(maximum) > decimalScale) {
                throw SurveyDomainException.invariant(
                        "SURVEY_NUMBER_BOUND_SCALE_INVALID",
                        "rule",
                        "number bounds must fit decimalScale");
            }
        } else {
            if (decimalScale != 0) {
                throw SurveyDomainException.invariant(
                        "SURVEY_NUMBER_INTEGER_SCALE_INVALID",
                        "rule.decimalScale",
                        "decimalScale must be 0 when decimals are not allowed");
            }
            if (fractionDigits(minimum) > 0 || fractionDigits(maximum) > 0) {
                throw SurveyDomainException.invariant(
                        "SURVEY_NUMBER_INTEGER_BOUND_INVALID",
                        "rule",
                        "integer number bounds must not contain fractions");
            }
        }
    }

    public static NumberRule integers(
            BigDecimal minimum,
            BigDecimal maximum
    ) {
        return new NumberRule(minimum, maximum, false, 0);
    }

    @Override
    public SurveyQuestionType questionType() {
        return SurveyQuestionType.NUMBER;
    }

    private static BigDecimal canonical(BigDecimal value) {
        BigDecimal normalized = value.stripTrailingZeros();
        return normalized.compareTo(BigDecimal.ZERO) == 0
                ? BigDecimal.ZERO
                : normalized;
    }

    private static int fractionDigits(BigDecimal value) {
        return Math.max(value.scale(), 0);
    }
}
