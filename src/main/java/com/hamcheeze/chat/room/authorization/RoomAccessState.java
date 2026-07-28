package com.hamcheeze.chat.room.authorization;

public enum RoomAccessState {
    ACTIVE_MEMBER,
    ROOM_NOT_FOUND,
    ROOM_CLOSED,
    MEMBERSHIP_NOT_FOUND,
    MEMBERSHIP_LEFT,
    MEMBERSHIP_BANNED
}
