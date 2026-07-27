package com.hamcheeze.chat.websocket.connection;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.websocket.protocol.StompPolicyException;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

import java.security.Principal;

@Component
public final class ActiveConnectionLifecycleInterceptor
        implements ChannelInterceptor {

    private final ActiveConnectionRegistry activeConnections;
    private final TransportSessionRegistry transportSessions;
    private final Counter replacedCounter;

    public ActiveConnectionLifecycleInterceptor(
            ActiveConnectionRegistry activeConnections,
            TransportSessionRegistry transportSessions,
            MeterRegistry meterRegistry
    ) {
        this.activeConnections = activeConnections;
        this.transportSessions = transportSessions;
        this.replacedCounter =
                meterRegistry.counter("websocket.connections.replaced");
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        StompCommand command = accessor.getCommand();
        if (command == null) {
            return message;
        }
        if (command == StompCommand.CONNECT) {
            activate(accessor);
        } else if (command == StompCommand.SEND
                || command == StompCommand.SUBSCRIBE) {
            verifyActive(accessor);
        }
        return message;
    }

    private void activate(StompHeaderAccessor accessor) {
        Principal user = requireUser(accessor);
        String connectionId = requireSessionId(accessor);
        ConnectionActivation activation =
                activeConnections.activate(user.getName(), connectionId);
        if (!activation.activated()) {
            throw new StompPolicyException("CONNECTION_CAPACITY_EXCEEDED");
        }

        String replaced = activation.replacedConnectionId();
        if (replaced != null) {
            BestEffortMetricRecorder.increment(
                    "websocket.connections.replaced",
                    replacedCounter);
            transportSessions.closeReplaced(replaced);
        }
    }

    private void verifyActive(StompHeaderAccessor accessor) {
        Principal user = requireUser(accessor);
        String connectionId = requireSessionId(accessor);
        if (!activeConnections.isActive(user.getName(), connectionId)) {
            throw new StompPolicyException("INACTIVE_CONNECTION");
        }
    }

    private static Principal requireUser(StompHeaderAccessor accessor) {
        if (accessor.getUser() == null) {
            throw new StompPolicyException("UNAUTHORIZED");
        }
        return accessor.getUser();
    }

    private static String requireSessionId(StompHeaderAccessor accessor) {
        if (accessor.getSessionId() == null) {
            throw new StompPolicyException("MISSING_CONNECTION_ID");
        }
        return accessor.getSessionId();
    }
}
