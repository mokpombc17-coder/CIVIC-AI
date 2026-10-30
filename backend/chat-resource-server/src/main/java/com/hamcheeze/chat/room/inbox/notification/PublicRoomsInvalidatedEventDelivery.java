package com.hamcheeze.chat.room.inbox.notification;

public interface PublicRoomsInvalidatedEventDelivery {

    void deliver(
            String userId,
            String connectionId,
            PublicRoomsInvalidatedEvent event);
}
