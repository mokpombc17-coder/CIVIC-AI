package com.hamcheeze.chat.room.query;

import java.util.Objects;
import java.util.regex.Pattern;

public record AdminRoomQueryCursor(
        int version,
        Scope scope,
        AdminRoomQueryCriteria criteria,
        String lastRoomId
) {

    public static final int CURRENT_VERSION = 1;
    private static final Pattern ROOM_ID =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    public AdminRoomQueryCursor {
        if (version != CURRENT_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported cursor version");
        }
        Objects.requireNonNull(scope, "scope");
        Objects.requireNonNull(criteria, "criteria");
        if (scope != Scope.ADMIN_ROOMS) {
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
        ADMIN_ROOMS
    }
}
