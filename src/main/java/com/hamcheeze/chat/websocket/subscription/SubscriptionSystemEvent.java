package com.hamcheeze.chat.websocket.subscription;

public sealed interface SubscriptionSystemEvent
        permits SubscriptionRejected,
        RoomSubscriptionsReady,
        RoomSubscriptionSyncRejected {
}
