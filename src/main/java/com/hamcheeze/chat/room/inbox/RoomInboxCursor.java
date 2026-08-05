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
        requireMongoDateCompatible(lastActivityAt);
        if (lastRoomId == null
                || !ROOM_ID_PATTERN.matcher(lastRoomId).matches()) {
            throw new IllegalArgumentException(
                    "lastRoomId is invalid");
        }
    }

    private static void requireMongoDateCompatible(Instant value) {
        Objects.requireNonNull(value, "lastActivityAt");
        final long epochMillis;
        try {
            epochMillis = value.toEpochMilli();
        } catch (ArithmeticException exception) {
            throw new IllegalArgumentException(
                    "lastActivityAt is outside MongoDB Date range",
                    exception);
        }
        if (!Instant.ofEpochMilli(epochMillis).equals(value)) {
            throw new IllegalArgumentException(
                    "lastActivityAt must have millisecond precision");
        }
    }

    public enum Scope {
        MY_ROOM_INBOX
    }
}
