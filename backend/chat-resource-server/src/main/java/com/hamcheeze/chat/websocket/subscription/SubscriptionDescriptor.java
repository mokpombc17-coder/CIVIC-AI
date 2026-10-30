package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.websocket.protocol.DestinationKind;

public record SubscriptionDescriptor(
        String subscriptionId,
        String userId,
        String destination,
        DestinationKind kind,
        String roomId,
        String membershipId,
        Long membershipVersion,
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
                null,
                null,
                messageVisibleAfterSequence,
                false);
    }

    public SubscriptionDescriptor(
            String subscriptionId,
            String userId,
            String destination,
            DestinationKind kind,
            String roomId,
            Long messageVisibleAfterSequence,
            boolean roomAccessRevoked
    ) {
        this(
                subscriptionId,
                userId,
                destination,
                kind,
                roomId,
                null,
                null,
                messageVisibleAfterSequence,
                roomAccessRevoked);
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
            boolean identityAbsent = membershipId == null
                    && membershipVersion == null;
            boolean identityPresent = membershipId != null
                    && !membershipId.isBlank()
                    && membershipVersion != null
                    && membershipVersion >= 0;
            if (!identityAbsent && !identityPresent) {
                throw new IllegalArgumentException(
                        "Room membership identity must be complete");
            }
        } else if (roomId != null && roomId.isBlank()) {
            throw new IllegalArgumentException(
                    "roomId must not be blank");
        }
        if (roomScoped(kind)) {
            if (messageVisibleAfterSequence == null
                    || messageVisibleAfterSequence < 0) {
                throw new IllegalArgumentException(
                        "Room subscriptions require a valid boundary");
            }
        } else if (messageVisibleAfterSequence != null) {
            throw new IllegalArgumentException(
                    "Only Room subscriptions may have a boundary");
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
                        membershipId,
                        membershipVersion,
                        messageVisibleAfterSequence,
                        true);
    }

    private static boolean roomScoped(DestinationKind kind) {
        return kind == DestinationKind.TOPIC_ROOM_MESSAGES
                || kind == DestinationKind.TOPIC_ROOM_EVENTS
                || kind == DestinationKind.TOPIC_ROOM_READ_RECEIPTS;
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
    }
}
