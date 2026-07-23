package com.hamcheeze.chat.websocket.lifecycle;

import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.subscription.ChatSubscriptionRegistry;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;

@Component
public final class WebSocketLifecycleListener {

    private final ActiveConnectionRegistry activeConnections;
    private final ChatSubscriptionRegistry subscriptions;

    public WebSocketLifecycleListener(
            ActiveConnectionRegistry activeConnections,
            ChatSubscriptionRegistry subscriptions
    ) {
        this.activeConnections = activeConnections;
        this.subscriptions = subscriptions;
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        String connectionId = event.getSessionId();
        subscriptions.removeAll(connectionId);

        StompHeaderAccessor accessor =
                StompHeaderAccessor.wrap(event.getMessage());
        Principal user = accessor.getUser();
        if (user != null) {
            activeConnections.deactivate(user.getName(), connectionId);
        }
    }
}
