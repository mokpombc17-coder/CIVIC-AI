package com.hamcheeze.vote.survey.application.idempotency;

public final class SurveyIdempotencyException extends RuntimeException {

    private final SurveyIdempotencyErrorCode code;
    private final int httpStatus;

    private SurveyIdempotencyException(
            SurveyIdempotencyErrorCode code,
            int httpStatus,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = code;
        this.httpStatus = httpStatus;
    }

    public static SurveyIdempotencyException invalidKey(
            Throwable cause
    ) {
        return new SurveyIdempotencyException(
                SurveyIdempotencyErrorCode.INVALID_IDEMPOTENCY_KEY,
                400,
                "Idempotency-Key must be a UUID",
                cause);
    }

    public static SurveyIdempotencyException conflict() {
        return new SurveyIdempotencyException(
                SurveyIdempotencyErrorCode.IDEMPOTENCY_CONFLICT,
                409,
                "Idempotency-Key was already used for a different request",
                null);
    }

    public SurveyIdempotencyErrorCode code() {
        return code;
    }

    public int httpStatus() {
        return httpStatus;
    }
}
