package com.hamcheeze.chat.websocket.subscription;

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

    Set<String> findConnectionIdsByRoom(String roomId);

    int activeSubscriptionCount();

    int activeRoomSubscriberCount();
}
