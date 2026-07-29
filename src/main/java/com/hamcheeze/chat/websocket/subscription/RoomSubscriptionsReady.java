package com.hamcheeze.chat.websocket.subscription;

public record RoomSubscriptionsReady(
        String status,
        String eventType,
        String requestId,
        String roomId,
        long watermarkSequence
) implements SubscriptionSystemEvent {

    public RoomSubscriptionsReady(
            String requestId,
            String roomId,
            long watermarkSequence
    ) {
        this(
                "READY",
                "ROOM_SUBSCRIPTIONS_READY",
                requestId,
                roomId,
                watermarkSequence);
    }
}
