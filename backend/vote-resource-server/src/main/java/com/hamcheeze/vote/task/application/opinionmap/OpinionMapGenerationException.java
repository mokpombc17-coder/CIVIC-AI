package com.hamcheeze.vote.task.application.opinionmap;

public final class OpinionMapGenerationException extends RuntimeException {

    private final String errorCode;
    private final boolean retryable;
    private final Integer httpStatus;

    public OpinionMapGenerationException(
            String errorCode,
            boolean retryable,
            String message
    ) {
        this(errorCode, retryable, message, null, null);
    }

    public OpinionMapGenerationException(
            String errorCode,
            boolean retryable,
            String message,
            Throwable cause
    ) {
        this(errorCode, retryable, message, cause, null);
    }

    public OpinionMapGenerationException(
            String errorCode,
            boolean retryable,
            String message,
            Throwable cause,
            Integer httpStatus
    ) {
        super(message, cause);
        this.errorCode = requireText(errorCode);
        this.retryable = retryable;
        if (httpStatus != null && (httpStatus < 100 || httpStatus > 599)) {
            throw new IllegalArgumentException("httpStatus is invalid");
        }
        this.httpStatus = httpStatus;
    }

    private static String requireText(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    "errorCode must not be blank");
        }
        return value.trim();
    }

    public String errorCode() { return errorCode; }
    public boolean retryable() { return retryable; }
    public Integer httpStatus() { return httpStatus; }
}
