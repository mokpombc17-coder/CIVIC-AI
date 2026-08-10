package com.hamcheeze.chat.room.receipt;

public interface RoomReadReceiptDeliveryPort {

    RoomReadReceiptDeliveryOutcome publish(
            RoomReadReceiptEventEnvelope event);
}
