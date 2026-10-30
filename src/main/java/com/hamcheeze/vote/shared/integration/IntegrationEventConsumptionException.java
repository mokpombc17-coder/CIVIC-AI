package com.hamcheeze.vote.shared.integration;

import java.util.Objects;

public final class IntegrationEventConsumptionException
        extends RuntimeException {

    private final String errorCode;
    private final boolean retryable;

    public IntegrationEventConsumptionException(
            String errorCode,
            boolean retryable,
            String message
    ) {
        this(errorCode, retryable, message, null);
    }

    public IntegrationEventConsumptionException(
            String errorCode,
            boolean retryable,
            String message,
            Throwable cause
    ) {
        super(requireText(message, "message"), cause);
        this.errorCode = requireText(errorCode, "errorCode");
        this.retryable = retryable;
    }

    public String errorCode() {
        return errorCode;
    }

    public boolean retryable() {
        return retryable;
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        if (value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value;
    }
}
