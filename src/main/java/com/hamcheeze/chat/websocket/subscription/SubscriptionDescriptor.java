package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.websocket.protocol.DestinationKind;

public record SubscriptionDescriptor(
        String subscriptionId,
        String userId,
        String destination,
        DestinationKind kind,
        String roomId
) {

    public SubscriptionDescriptor {
        requireText(subscriptionId, "subscriptionId");
        requireText(userId, "userId");
        requireText(destination, "destination");
        if (kind == null) {
            throw new IllegalArgumentException("kind must not be null");
        }
        if (roomScoped(kind)) {
            requireText(roomId, "roomId");
        } else if (roomId != null && roomId.isBlank()) {
            throw new IllegalArgumentException(
                    "roomId must not be blank");
        }
    }

    private static boolean roomScoped(DestinationKind kind) {
        return kind == DestinationKind.TOPIC_ROOM_MESSAGES
                || kind == DestinationKind.TOPIC_ROOM_EVENTS;
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
    }
}
