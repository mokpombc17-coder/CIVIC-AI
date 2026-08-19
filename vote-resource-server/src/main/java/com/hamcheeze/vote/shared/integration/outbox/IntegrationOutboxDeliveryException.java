package com.hamcheeze.vote.shared.integration.outbox;

import java.util.Objects;
import java.util.UUID;

public final class IntegrationOutboxDeliveryException
        extends RuntimeException {

    private final UUID eventId;
    private final String errorCode;
    private final boolean retryable;

    public IntegrationOutboxDeliveryException(
            UUID eventId,
            String errorCode,
            boolean retryable,
            String message,
            Throwable cause
    ) {
        super(requireText(message, "message"), cause);
        this.eventId = Objects.requireNonNull(eventId, "eventId");
        this.errorCode = requireText(errorCode, "errorCode");
        this.retryable = retryable;
    }

    public UUID eventId() {
        return eventId;
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
