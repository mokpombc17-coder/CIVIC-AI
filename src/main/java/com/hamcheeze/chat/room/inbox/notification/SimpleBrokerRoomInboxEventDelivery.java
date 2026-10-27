package com.hamcheeze.chat.room.inbox.notification;

import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Objects;

public final class SimpleBrokerRoomInboxEventDelivery
        implements RoomInboxEventDelivery,
        PublicRoomsInvalidatedEventDelivery {

    private static final String DESTINATION = "/queue/room-inbox-events";

    private final SimpMessagingTemplate messagingTemplate;

    public SimpleBrokerRoomInboxEventDelivery(
            SimpMessagingTemplate messagingTemplate
    ) {
        this.messagingTemplate = Objects.requireNonNull(
                messagingTemplate, "messagingTemplate");
    }

    @Override
    public void deliver(
            String userId,
            String connectionId,
            RoomInboxEvent event
    ) {
        send(userId, connectionId, event);
    }

    @Override
    public void deliver(
            String userId,
            String connectionId,
            PublicRoomsInvalidatedEvent event
    ) {
        send(userId, connectionId, event);
    }

    private void send(
            String userId,
            String connectionId,
            Object event
    ) {
        SimpMessageHeaderAccessor headers =
                SimpMessageHeaderAccessor.create();
        headers.setSessionId(connectionId);
        headers.setLeaveMutable(true);
        messagingTemplate.convertAndSendToUser(
                userId,
                DESTINATION,
                event,
                headers.getMessageHeaders());
    }
}
