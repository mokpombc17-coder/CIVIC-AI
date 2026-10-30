package com.hamcheeze.chat.room.inbox.notification;

public interface RoomInboxEventDelivery {

    void deliver(
            String userId,
            String connectionId,
            RoomInboxEvent event);
}
