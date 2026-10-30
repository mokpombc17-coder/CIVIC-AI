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
        return close(connectionId, CONNECTION_REPLACED)
                == TransportSessionCloseResult.CLOSED;
    }

    public TransportSessionCloseResult close(
            String connectionId,
            CloseStatus closeStatus
    ) {
        WebSocketSession session = sessions.get(connectionId);
        if (session == null || !session.isOpen()) {
            return TransportSessionCloseResult
                    .ALREADY_CLOSED_OR_MISSING;
        }
        try {
            session.close(closeStatus);
            return TransportSessionCloseResult.CLOSED;
        } catch (IOException | RuntimeException exception) {
            return TransportSessionCloseResult.FAILED;
        }
    }
}
