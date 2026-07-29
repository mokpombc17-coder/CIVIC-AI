package com.hamcheeze.chat.application;

public interface RoomAuthorizationService {

    RoomAuthorizationDecision authorizeSubscription(
            String userId,
            String roomId
    );

    RoomAuthorizationDecision authorizeMessageSend(
            String userId,
            String roomId
    );

    default RoomAuthorizationDecision authorizeMessageHistory(
            String userId,
            String roomId
    ) {
        return authorizeSubscription(userId, roomId);
    }
}
