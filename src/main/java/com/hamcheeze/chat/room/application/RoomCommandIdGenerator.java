package com.hamcheeze.chat.room.application;

public interface RoomCommandIdGenerator {

    String newRoomId();

    String newMembershipId();

    String newReceiptId();
}
