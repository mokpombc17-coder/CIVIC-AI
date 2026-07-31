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

    static String roomDescription(String value) {
        if (value == null) {
            throw new IllegalArgumentException(
                    "description must not be null");
        }
        requireAllowedDescriptionControlCharacters(value);
        String canonical = value.strip();
        if (canonical.codePointCount(0, canonical.length())
                > Room.MAX_DESCRIPTION_CODE_POINTS) {
            throw new IllegalArgumentException(
                    "description must not exceed "
                            + Room.MAX_DESCRIPTION_CODE_POINTS
                            + " code points");
        }
        return canonical;
    }

    private static void requireAllowedDescriptionControlCharacters(
            String description
    ) {
        for (int offset = 0; offset < description.length();) {
            int codePoint = description.codePointAt(offset);
            if (codePoint < 0x20
                    && codePoint != '\t'
                    && codePoint != '\n'
                    && codePoint != '\r') {
                throw new IllegalArgumentException(
                        "description contains an invalid "
                                + "control character");
            }
            offset += Character.charCount(codePoint);
        }
    }

    static String optionalRoomDescription(String value) {
        return value == null ? "" : roomDescription(value);
    }
}
