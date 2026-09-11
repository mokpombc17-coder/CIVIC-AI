package com.hamcheeze.vote.task.application.opinionmap;

public final class OpinionMapGenerationException extends RuntimeException {

    private final String errorCode;
    private final boolean retryable;

    public OpinionMapGenerationException(
            String errorCode,
            boolean retryable,
            String message
    ) {
        super(message);
        this.errorCode = requireText(errorCode);
        this.retryable = retryable;
    }

    public OpinionMapGenerationException(
            String errorCode,
            boolean retryable,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.errorCode = requireText(errorCode);
        this.retryable = retryable;
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
}
