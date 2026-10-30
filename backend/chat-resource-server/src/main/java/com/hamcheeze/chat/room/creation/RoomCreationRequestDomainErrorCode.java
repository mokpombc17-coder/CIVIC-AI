package com.hamcheeze.chat.room.creation;

public enum RoomCreationRequestDomainErrorCode {
    INVALID_CREATION_REQUEST_ID,
    INVALID_USER_ID,
    INVALID_REQUEST_FINGERPRINT,
    INVALID_PROPOSED_ROOM,
    INVALID_STATE,
    INVALID_TRANSITION,
    INVALID_VERSION
}
