package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.websocket.protocol.DestinationKind;

public record SubscriptionDescriptor(
        String subscriptionId,
        String destination,
        DestinationKind kind,
        String roomId
) {
}
