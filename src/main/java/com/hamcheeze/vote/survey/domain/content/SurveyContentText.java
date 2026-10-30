package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;

final class SurveyContentText {

    private SurveyContentText() {
    }

    static String required(
            String value,
            int maxLength,
            String requiredCode,
            String tooLongCode,
            String path
    ) {
        if (value == null || value.isBlank()) {
            throw SurveyDomainException.invariant(
                    requiredCode,
                    path,
                    path + " must not be blank");
        }
        String normalized = value.strip();
        ensureMaxLength(normalized, maxLength, tooLongCode, path);
        return normalized;
    }

    static String optional(
            String value,
            int maxLength,
            String tooLongCode,
            String path
    ) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.strip();
        ensureMaxLength(normalized, maxLength, tooLongCode, path);
        return normalized;
    }

    private static void ensureMaxLength(
            String value,
            int maxLength,
            String code,
            String path
    ) {
        int length = value.codePointCount(0, value.length());
        if (length > maxLength) {
            throw SurveyDomainException.invariant(
                    code,
                    path,
                    path + " must have at most " + maxLength + " characters");
        }
    }
}
