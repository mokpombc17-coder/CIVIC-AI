package com.hamcheeze.chat.application;

public interface RoomAuthorizationService {

    RoomAuthorizationDecision authorizeSubscription(
            String userId,
            String roomId
    );

    RoomMessageSendAuthorization authorizeMessageSendWithContext(
            String userId,
            String roomId
    );

    default RoomAuthorizationDecision authorizeMessageSend(
            String userId,
            String roomId
    ) {
        return authorizeMessageSendWithContext(userId, roomId)
                .decision();
    }

    default RoomAuthorizationDecision authorizeMessageHistory(
            String userId,
            String roomId
    ) {
        return authorizeSubscription(userId, roomId);
    }
}
