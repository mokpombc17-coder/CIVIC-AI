package com.hamcheeze.chat.websocket.access;

import com.hamcheeze.chat.room.application.access.RoomAccessRevocationPort;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.connection.TransportSessionRegistry;
import com.hamcheeze.chat.websocket.subscription.ChatSubscriptionRegistry;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class WebSocketRoomAccessConfiguration {

    @Bean
    RoomAccessRevocationPort roomAccessRevocationPort(
            ActiveConnectionRegistry activeConnections,
            ChatSubscriptionRegistry subscriptions,
            TransportSessionRegistry transportSessions,
            MeterRegistry meterRegistry
    ) {
        return new WebSocketRoomAccessRevoker(
                activeConnections,
                subscriptions,
                transportSessions,
                meterRegistry);
    }
}
