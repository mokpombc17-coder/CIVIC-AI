package com.hamcheeze.chat.room.inbox;

import java.time.Instant;
import java.util.Objects;
import java.util.regex.Pattern;

public record RoomInboxCursor(
        int version,
        Scope scope,
        Instant lastActivityAt,
        String lastRoomId
) {

    public static final int CURRENT_VERSION = 2;
    private static final Pattern ROOM_ID_PATTERN =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    public RoomInboxCursor {
        if (version != CURRENT_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported Room inbox cursor version");
        }
        if (scope != Scope.MY_ROOM_INBOX) {
            throw new IllegalArgumentException(
                    "Unsupported Room inbox cursor scope");
        }
        Objects.requireNonNull(lastActivityAt, "lastActivityAt");
        if (lastRoomId == null
                || !ROOM_ID_PATTERN.matcher(lastRoomId).matches()) {
            throw new IllegalArgumentException(
                    "lastRoomId is invalid");
        }
    }

    public enum Scope {
        MY_ROOM_INBOX
    }
}
