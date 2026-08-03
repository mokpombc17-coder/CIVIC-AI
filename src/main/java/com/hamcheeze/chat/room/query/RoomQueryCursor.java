package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.MembershipStatus;

import java.util.Objects;

public record RoomQueryCursor(
        int version,
        Scope scope,
        MembershipStatus status,
        String lastMembershipId
) {

    public static final int CURRENT_VERSION = 1;

    public RoomQueryCursor {
        if (version != CURRENT_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported cursor version");
        }
        Objects.requireNonNull(scope, "scope");
        Objects.requireNonNull(status, "status");
        if (lastMembershipId == null
                || lastMembershipId.isBlank()) {
            throw new IllegalArgumentException(
                    "lastMembershipId must not be blank");
        }
    }

    public enum Scope {
        MY_ACTIVE_ROOMS,
        MY_ROOM_INBOX,
        ROOM_MEMBERSHIPS
    }
}
