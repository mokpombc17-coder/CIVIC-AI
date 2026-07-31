package com.hamcheeze.chat.room.persistence;

public enum RoomCommandType {
    CREATE_ROOM,
    JOIN_ROOM,
    LEAVE_ROOM,
    TRANSFER_OWNERSHIP,
    BAN_MEMBER,
    UNBAN_MEMBER,
    CLOSE_ROOM,
    UPDATE_ROOM_SETTINGS
}
