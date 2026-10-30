package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

final class SurveyIdSupport {

    private SurveyIdSupport() {
    }

    static UUID require(UUID value, String code, String path) {
        if (value == null) {
            throw SurveyDomainException.invariant(
                    code,
                    path,
                    path + " must not be null");
        }
        return value;
    }
}
