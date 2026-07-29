package com.hamcheeze.chat.websocket.subscription;

public record SubscriptionRejected(
        String status,
        SubscriptionRejectedCode code,
        String destination
) implements SubscriptionSystemEvent {
    public SubscriptionRejected(
            SubscriptionRejectedCode code,
            String destination
    ) {
        this("REJECTED", code, destination);
    }
}
