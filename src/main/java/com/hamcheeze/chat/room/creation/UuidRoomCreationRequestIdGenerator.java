package com.hamcheeze.chat.room.creation;

import java.util.UUID;

public final class UuidRoomCreationRequestIdGenerator
        implements RoomCreationRequestIdGenerator {

    @Override
    public String newCreationRequestId() {
        return UUID.randomUUID().toString();
    }
}
