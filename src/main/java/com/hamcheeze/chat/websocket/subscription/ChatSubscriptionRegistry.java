package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.websocket.protocol.DestinationKind;

import java.util.Set;

public interface ChatSubscriptionRegistry {

    SubscriptionRegistrationResult register(
            String connectionId,
            SubscriptionDescriptor descriptor
    );

    boolean remove(String connectionId, String subscriptionId);

    int removeAll(String connectionId);

    boolean hasRoomSubscription(
            String connectionId,
            String roomId
    );

    boolean hasRoomSubscription(
            String connectionId,
            String userId,
            String roomId,
            DestinationKind kind
    );

    Set<String> findConnectionIdsByRoom(String roomId);

    Set<String> findConnectionIdsByUserAndRoom(
            String userId,
            String roomId
    );

    int activeSubscriptionCount();

    int activeRoomSubscriberCount();
}
