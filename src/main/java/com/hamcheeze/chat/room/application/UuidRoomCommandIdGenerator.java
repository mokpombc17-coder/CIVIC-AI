package com.hamcheeze.chat.room.application;

import java.util.UUID;

public final class UuidRoomCommandIdGenerator
        implements RoomCommandIdGenerator {

    @Override
    public String newRoomId() {
        return UUID.randomUUID().toString();
    }

    @Override
    public String newMembershipId() {
        return UUID.randomUUID().toString();
    }

    @Override
    public String newReceiptId() {
        return UUID.randomUUID().toString();
    }
}
