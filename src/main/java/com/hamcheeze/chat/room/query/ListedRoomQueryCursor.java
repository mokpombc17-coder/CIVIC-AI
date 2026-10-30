package com.hamcheeze.chat.room.query;

import java.time.Instant;
import java.util.Objects;
import java.util.regex.Pattern;

public record ListedRoomQueryCursor(
        int version,
        Scope scope,
        ListedRoomQueryCriteria criteria,
        Instant lastCreatedAt,
        String lastRoomId
) {

    public static final int CURRENT_VERSION = 4;
    private static final Pattern ROOM_ID =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    public ListedRoomQueryCursor {
        if (version != CURRENT_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported cursor version");
        }
        Objects.requireNonNull(scope, "scope");
        Objects.requireNonNull(criteria, "criteria");
        Objects.requireNonNull(lastCreatedAt, "lastCreatedAt");
        if (scope != Scope.LISTED_ROOMS) {
            throw new IllegalArgumentException(
                    "Unsupported cursor scope");
        }
        if (lastRoomId == null
                || !ROOM_ID.matcher(lastRoomId).matches()) {
            throw new IllegalArgumentException(
                    "lastRoomId has an invalid format");
        }
    }

    public enum Scope {
        LISTED_ROOMS
    }
}
