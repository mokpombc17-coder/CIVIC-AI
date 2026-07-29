package com.hamcheeze.chat.room.application.command;

import com.hamcheeze.chat.room.Room;
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

    static String roomName(String value) {
        String canonical = requireNonBlank(value, "name").trim();
        if (canonical.length() > Room.MAX_NAME_LENGTH) {
            throw new IllegalArgumentException(
                    "name must not exceed "
                            + Room.MAX_NAME_LENGTH
                            + " characters");
        }
        return canonical;
    }
}
