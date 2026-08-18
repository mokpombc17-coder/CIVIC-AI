package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;

import java.util.Objects;

public final class PersonaSurveySourceException extends RuntimeException {

    private final PersonaSurveySourceErrorCode code;
    private final SurveyResponseId responseId;

    private PersonaSurveySourceException(
            PersonaSurveySourceErrorCode code,
            SurveyResponseId responseId,
            String message
    ) {
        super(message);
        this.code = Objects.requireNonNull(code, "code");
        this.responseId = Objects.requireNonNull(responseId, "responseId");
    }

    public static PersonaSurveySourceException notFound(
            SurveyResponseId responseId
    ) {
        return new PersonaSurveySourceException(
                PersonaSurveySourceErrorCode.PERSONA_SURVEY_SOURCE_NOT_FOUND,
                responseId,
                "survey response source does not exist: " + responseId);
    }

    public static PersonaSurveySourceException integrityViolation(
            SurveyResponseId responseId,
            String detail
    ) {
        if (detail == null || detail.isBlank()) {
            throw new IllegalArgumentException("detail must not be blank");
        }
        return new PersonaSurveySourceException(
                PersonaSurveySourceErrorCode
                        .PERSONA_SURVEY_SOURCE_INTEGRITY_VIOLATION,
                responseId,
                "survey response source integrity violation: " + detail);
    }

    public PersonaSurveySourceErrorCode code() {
        return code;
    }

    public SurveyResponseId responseId() {
        return responseId;
    }
}
