package com.hamcheeze.chat.room.application.result;

public enum RoomCommandResultCode {
    ROOM_CREATED(false),
    JOINED(false),
    REJOINED(false),
    ALREADY_ACTIVE(false),
    LEFT(false),
    ALREADY_LEFT(false),
    OWNERSHIP_TRANSFERRED(false),
    BANNED(false),
    ALREADY_BANNED(false),
    UNBANNED(false),
    ALREADY_UNBANNED(false),
    CLOSED(false),
    ALREADY_CLOSED(false),
    ROOM_SETTINGS_UPDATED(false),
    ROOM_SETTINGS_UNCHANGED(false),
    ROOM_NOT_FOUND(true),
    MEMBERSHIP_NOT_FOUND(true),
    TARGET_MEMBERSHIP_NOT_FOUND(true),
    ROOM_CLOSED(true),
    JOIN_POLICY_NOT_OPEN(true),
    ROOM_MEMBER_LIMIT_EXCEEDED(true),
    NOT_ROOM_OWNER(true),
    ROOM_HAS_OTHER_ACTIVE_MEMBERS(true),
    OWNER_CANNOT_LEAVE(true),
    OWNER_CANNOT_BE_BANNED(true),
    MEMBERSHIP_BANNED(true),
    TARGET_MEMBERSHIP_NOT_ACTIVE(true),
    TARGET_MEMBERSHIP_NOT_MEMBER(true),
    OWNERSHIP_TARGET_MUST_DIFFER(true),
    IDEMPOTENCY_CONFLICT(true);

    private final boolean rejection;

    RoomCommandResultCode(boolean rejection) {
        this.rejection = rejection;
    }

    public boolean rejection() {
        return rejection;
    }
}
