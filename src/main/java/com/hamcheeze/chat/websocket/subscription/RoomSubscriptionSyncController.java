package com.hamcheeze.chat.websocket.subscription;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
public final class RoomSubscriptionSyncController {

    private final RoomSubscriptionSyncService syncService;

    public RoomSubscriptionSyncController(
            RoomSubscriptionSyncService syncService
    ) {
        this.syncService = syncService;
    }

    @MessageMapping("/rooms/{roomId}/subscriptions/sync")
    public void synchronize(
            @DestinationVariable String roomId,
            RoomSubscriptionSyncRequest request,
            Principal principal,
            SimpMessageHeaderAccessor headers
    ) {
        syncService.synchronize(
                principal.getName(),
                headers.getSessionId(),
                roomId,
                request);
    }
}
