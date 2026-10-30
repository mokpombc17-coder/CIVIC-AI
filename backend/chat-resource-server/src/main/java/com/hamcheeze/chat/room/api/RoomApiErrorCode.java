package com.hamcheeze.chat.room.api;

public enum RoomApiErrorCode {
    INVALID_IDEMPOTENCY_KEY,
    INVALID_REQUEST,
    INVALID_ROOM_ID,
    INVALID_CURSOR,
    UNAUTHENTICATED,
    ACCESS_DENIED,
    INTERNAL_ERROR
}
