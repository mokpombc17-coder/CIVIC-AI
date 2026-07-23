package com.hamcheeze.chat.application.skeleton;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("skeleton")
public final class UnavailableRoomAuthorizationService
        implements RoomAuthorizationService {

    @Override
    public RoomAuthorizationDecision authorizeSubscription(
            String userId,
            String roomId
    ) {
        return RoomAuthorizationDecision.UNAVAILABLE;
    }

    @Override
    public RoomAuthorizationDecision authorizeMessageSend(
            String userId,
            String roomId
    ) {
        return RoomAuthorizationDecision.UNAVAILABLE;
    }
}
