package com.hamcheeze.chat.websocket.connection;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public final class TransportSessionRegistry {

    public static final CloseStatus CONNECTION_REPLACED =
            new CloseStatus(4001, "CONNECTION_REPLACED");

    private final ConcurrentMap<String, WebSocketSession> sessions =
            new ConcurrentHashMap<>();

    public TransportSessionRegistry(MeterRegistry meterRegistry) {
        Gauge.builder(
                        "websocket.connections.open_transport",
                        sessions,
                        ConcurrentMap::size)
                .register(meterRegistry);
    }

    public void register(WebSocketSession session) {
        sessions.put(session.getId(), session);
    }

    public boolean remove(String connectionId) {
        return sessions.remove(connectionId) != null;
    }

    public boolean closeReplaced(String connectionId) {
        WebSocketSession session = sessions.get(connectionId);
        if (session == null || !session.isOpen()) {
            return false;
        }
        try {
            session.close(CONNECTION_REPLACED);
            return true;
        } catch (IOException exception) {
            return false;
        }
    }
}
