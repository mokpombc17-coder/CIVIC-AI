package com.hamcheeze.chat.websocket.subscription;

public record RoomSubscriptionSyncRejected(
        String status,
        String eventType,
        String requestId,
        String roomId,
        RoomSubscriptionSyncErrorCode code,
        boolean retryable
) implements SubscriptionSystemEvent {

    public RoomSubscriptionSyncRejected(
            String requestId,
            String roomId,
            RoomSubscriptionSyncErrorCode code,
            boolean retryable
    ) {
        this(
                "REJECTED",
                "ROOM_SUBSCRIPTION_SYNC_REJECTED",
                requestId,
                roomId,
                code,
                retryable);
    }
}
