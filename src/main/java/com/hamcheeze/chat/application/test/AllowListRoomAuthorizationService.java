package com.hamcheeze.chat.application.test;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.websocket.config.LimitTestRoomProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
@Profile("limit-test")
public final class AllowListRoomAuthorizationService
        implements RoomAuthorizationService {

    private final Set<String> allowedRooms;

    public AllowListRoomAuthorizationService(
            LimitTestRoomProperties properties
    ) {
        this.allowedRooms = Set.copyOf(properties.getAllowedRooms());
    }

    @Override
    public RoomAuthorizationDecision authorizeSubscription(
            String userId,
            String roomId
    ) {
        return decision(roomId);
    }

    @Override
    public RoomAuthorizationDecision authorizeMessageSend(
            String userId,
            String roomId
    ) {
        return decision(roomId);
    }

    private RoomAuthorizationDecision decision(String roomId) {
        return allowedRooms.contains(roomId)
                ? RoomAuthorizationDecision.ALLOWED
                : RoomAuthorizationDecision.FORBIDDEN;
    }
}
