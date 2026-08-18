package com.hamcheeze.vote.persona.domain;

import com.hamcheeze.vote.persona.domain.common.PersonaDomainException;

import java.math.BigDecimal;

public record PredictedAdoptionRate(BigDecimal value) {

    private static final BigDecimal MIN = BigDecimal.ZERO;
    private static final BigDecimal MAX = BigDecimal.ONE;

    public PredictedAdoptionRate {
        if (value == null) {
            throw PersonaDomainException.invariant(
                    "PREDICTED_ADOPTION_RATE_REQUIRED",
                    "predictedAdoptionRate",
                    "predictedAdoptionRate is required");
        }
        if (value.compareTo(MIN) < 0 || value.compareTo(MAX) > 0) {
            throw PersonaDomainException.invariant(
                    "PREDICTED_ADOPTION_RATE_OUT_OF_RANGE",
                    "predictedAdoptionRate",
                    "predictedAdoptionRate must be between 0 and 1");
        }
        value = value.stripTrailingZeros();
    }
}
