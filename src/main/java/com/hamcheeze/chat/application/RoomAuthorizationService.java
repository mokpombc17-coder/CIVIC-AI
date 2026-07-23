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
}
