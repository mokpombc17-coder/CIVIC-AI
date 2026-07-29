package com.hamcheeze.chat.room.query;

public record ListedRoomQueryCursor(
        int version,
        String lastRoomId
) {

    public static final int CURRENT_VERSION = 1;

    public ListedRoomQueryCursor {
        if (version != CURRENT_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported cursor version");
        }
        if (lastRoomId == null || lastRoomId.isBlank()) {
            throw new IllegalArgumentException(
                    "lastRoomId must not be blank");
        }
    }
}
