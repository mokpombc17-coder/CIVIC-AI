package com.hamcheeze.chat.room.creation.persistence;

public enum RoomCreationRequestInsertOutcome {
    INSERTED,
    EXISTING_REQUEST,
    PENDING_LIMIT_REACHED
}
