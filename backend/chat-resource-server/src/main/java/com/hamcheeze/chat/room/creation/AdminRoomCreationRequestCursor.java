package com.hamcheeze.chat.room.creation;

import java.time.Instant;
import java.util.Objects;

public record AdminRoomCreationRequestCursor(
        int version,
        RoomCreationRequestStatus status,
        Instant lastRequestedAt,
        String lastCreationRequestId
) {

    public static final int CURRENT_VERSION = 1;

    public AdminRoomCreationRequestCursor {
        if (version != CURRENT_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported cursor version");
        }
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(lastRequestedAt, "lastRequestedAt");
        if (lastCreationRequestId == null
                || lastCreationRequestId.isBlank()) {
            throw new IllegalArgumentException(
                    "lastCreationRequestId must not be blank");
        }
    }
}
