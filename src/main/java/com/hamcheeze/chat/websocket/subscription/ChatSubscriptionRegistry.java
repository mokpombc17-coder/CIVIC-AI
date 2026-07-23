package com.hamcheeze.chat.websocket.subscription;

public interface ChatSubscriptionRegistry {

    SubscriptionRegistrationResult register(
            String connectionId,
            SubscriptionDescriptor descriptor
    );

    boolean remove(String connectionId, String subscriptionId);

    int removeAll(String connectionId);

    int activeSubscriptionCount();

    int activeRoomSubscriberCount();
}
