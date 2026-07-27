package com.hamcheeze.chat.application.local;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.websocket.config.LocalRoomProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
@Profile("local")
public final class LocalAllowListRoomAuthorizationService
        implements RoomAuthorizationService {

    private final Set<String> allowedRooms;

    public LocalAllowListRoomAuthorizationService(
            LocalRoomProperties properties
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
