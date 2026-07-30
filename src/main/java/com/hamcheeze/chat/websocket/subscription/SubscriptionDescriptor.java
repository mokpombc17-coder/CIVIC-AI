package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.websocket.protocol.DestinationKind;

public record SubscriptionDescriptor(
        String subscriptionId,
        String userId,
        String destination,
        DestinationKind kind,
        String roomId,
        Long messageVisibleAfterSequence,
        boolean roomAccessRevoked
) {

    public SubscriptionDescriptor(
            String subscriptionId,
            String userId,
            String destination,
            DestinationKind kind,
            String roomId,
            Long messageVisibleAfterSequence
    ) {
        this(
                subscriptionId,
                userId,
                destination,
                kind,
                roomId,
                messageVisibleAfterSequence,
                false);
    }

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
        if (kind == DestinationKind.TOPIC_ROOM_MESSAGES) {
            if (messageVisibleAfterSequence == null
                    || messageVisibleAfterSequence < 0) {
                throw new IllegalArgumentException(
                        "Message subscriptions require a valid boundary");
            }
        } else if (messageVisibleAfterSequence != null) {
            throw new IllegalArgumentException(
                    "Only message subscriptions may have a boundary");
        }
        if (roomAccessRevoked && !roomScoped(kind)) {
            throw new IllegalArgumentException(
                    "Only room subscriptions may be access-revoked");
        }
    }

    public SubscriptionDescriptor revokeRoomAccess() {
        if (!roomScoped(kind)) {
            throw new IllegalStateException(
                    "Only room subscriptions may be access-revoked");
        }
        return roomAccessRevoked
                ? this
                : new SubscriptionDescriptor(
                        subscriptionId,
                        userId,
                        destination,
                        kind,
                        roomId,
                        messageVisibleAfterSequence,
                        true);
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
