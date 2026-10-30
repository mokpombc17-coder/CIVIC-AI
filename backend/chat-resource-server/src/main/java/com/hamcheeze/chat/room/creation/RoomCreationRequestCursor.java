package com.hamcheeze.chat.room.creation;

import java.time.Instant;

public record RoomCreationRequestCursor(
        int version,
        String requesterUserId,
        Instant lastRequestedAt,
        String lastCreationRequestId
) {

    public static final int CURRENT_VERSION = 1;

    public RoomCreationRequestCursor {
        if (version != CURRENT_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported cursor version");
        }
        if (requesterUserId == null || requesterUserId.isBlank()) {
            throw new IllegalArgumentException(
                    "requesterUserId must not be blank");
        }
        if (lastRequestedAt == null) {
            throw new IllegalArgumentException(
                    "lastRequestedAt must not be null");
        }
        if (lastCreationRequestId == null
                || lastCreationRequestId.isBlank()) {
            throw new IllegalArgumentException(
                    "lastCreationRequestId must not be blank");
        }
    }
}
