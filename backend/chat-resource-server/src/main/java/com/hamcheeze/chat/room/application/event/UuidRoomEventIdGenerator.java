package com.hamcheeze.chat.room.application.event;

import java.util.UUID;

public final class UuidRoomEventIdGenerator
        implements RoomEventIdGenerator {

    @Override
    public String newEventId() {
        return UUID.randomUUID().toString();
    }
}
