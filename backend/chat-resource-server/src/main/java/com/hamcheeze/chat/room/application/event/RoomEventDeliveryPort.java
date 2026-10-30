package com.hamcheeze.chat.room.application.event;

import com.hamcheeze.chat.room.event.RoomEventEnvelope;

public interface RoomEventDeliveryPort {

    RoomEventDeliveryOutcome publishToRoom(
            RoomEventEnvelope event
    );

    RoomEventDeliveryOutcome publishToUser(
            String userId,
            RoomEventEnvelope event
    );
}
