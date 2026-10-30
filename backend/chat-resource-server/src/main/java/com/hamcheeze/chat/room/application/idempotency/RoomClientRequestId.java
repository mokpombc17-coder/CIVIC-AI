package com.hamcheeze.chat.room.application.idempotency;

import java.util.UUID;

public record RoomClientRequestId(String value) {

    public RoomClientRequestId {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    "clientRequestId must be a UUID");
        }
        try {
            String canonical = UUID.fromString(value).toString();
            if (!canonical.equalsIgnoreCase(value)) {
                throw new IllegalArgumentException(
                        "clientRequestId must be a UUID");
            }
            value = canonical;
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "clientRequestId must be a UUID",
                    exception);
        }
    }

    public static String canonicalize(String value) {
        return new RoomClientRequestId(value).value();
    }
}
