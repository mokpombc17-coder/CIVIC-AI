package com.hamcheeze.chat.room.inbox.notification;

import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Objects;

public final class SimpleBrokerRoomInboxEventDelivery
        implements RoomInboxEventDelivery {

    private final SimpMessagingTemplate messagingTemplate;

    public SimpleBrokerRoomInboxEventDelivery(
            SimpMessagingTemplate messagingTemplate
    ) {
        this.messagingTemplate = Objects.requireNonNull(
                messagingTemplate, "messagingTemplate");
    }

    @Override
    public boolean deliver(
            String userId,
            String connectionId,
            RoomInboxEvent event
    ) {
        SimpMessageHeaderAccessor headers =
                SimpMessageHeaderAccessor.create();
        headers.setSessionId(connectionId);
        headers.setLeaveMutable(true);
        messagingTemplate.convertAndSendToUser(
                userId,
                "/queue/room-inbox-events",
                event,
                headers.getMessageHeaders());
        return true;
    }
}
