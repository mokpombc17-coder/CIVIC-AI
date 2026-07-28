package com.hamcheeze.chat.room.application.command;

import com.hamcheeze.chat.room.application.idempotency.RoomClientRequestId;

final class RoomCommandValidation {

    private RoomCommandValidation() {
    }

    static String requireNonBlank(
            String value,
            String fieldName
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
        return value;
    }

    static String clientRequestId(String value) {
        return RoomClientRequestId.canonicalize(value);
    }
}
