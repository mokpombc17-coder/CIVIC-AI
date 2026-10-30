package com.hamcheeze.chat.room.event;

import java.util.regex.Pattern;

final class RoomEventValidation {

    private static final Pattern ROOM_ID_PATTERN =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    private RoomEventValidation() {
    }

    static String requireRoomId(String roomId) {
        if (roomId == null
                || !ROOM_ID_PATTERN.matcher(roomId).matches()) {
            throw new IllegalArgumentException("Invalid roomId");
        }
        return roomId;
    }

    static String requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
        return value;
    }

    static long requireVersion(long version, String fieldName) {
        if (version < 0) {
            throw new IllegalArgumentException(
                    fieldName + " must not be negative");
        }
        return version;
    }
}
