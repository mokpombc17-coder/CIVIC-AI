package com.hamcheeze.chat.room.receipt;

public sealed interface RoomReadReceiptEventPayload
        permits RoomReadPositionsAdvancedPayload,
        RoomReadReceiptStateInvalidatedPayload {

    String roomId();
}
