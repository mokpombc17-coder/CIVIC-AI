package com.hamcheeze.vote.survey.domain.response;

final class SurveyAnswerTextNormalizer {

    private SurveyAnswerTextNormalizer() {
    }

    static NormalizedText normalize(String value) {
        if (value == null) {
            return new NormalizedText(null, false);
        }
        String normalized = value
                .replace("\r\n", "\n")
                .replace('\r', '\n')
                .strip();
        boolean forbiddenControlCharacter = normalized.codePoints()
                .anyMatch(SurveyAnswerTextNormalizer::isForbiddenControl);
        return new NormalizedText(normalized, forbiddenControlCharacter);
    }

    private static boolean isForbiddenControl(int codePoint) {
        return Character.isISOControl(codePoint)
                && codePoint != '\n'
                && codePoint != '\t';
    }

    record NormalizedText(String value, boolean hasForbiddenControlCharacter) {

        int codePointLength() {
            if (value == null) {
                return 0;
            }
            return value.codePointCount(0, value.length());
        }

        boolean isBlank() {
            return value == null || value.isBlank();
        }
    }
}
