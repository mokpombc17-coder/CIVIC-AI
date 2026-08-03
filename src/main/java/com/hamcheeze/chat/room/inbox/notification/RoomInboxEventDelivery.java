package com.hamcheeze.chat.room.inbox.notification;

public interface RoomInboxEventDelivery {

    boolean deliver(
            String userId,
            String connectionId,
            RoomInboxEvent event);
}
