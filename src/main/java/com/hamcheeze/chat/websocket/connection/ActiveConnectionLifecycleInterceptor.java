package com.hamcheeze.chat.websocket.connection;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.websocket.protocol.StompPolicyException;
import com.hamcheeze.chat.websocket.subscription.ChatSubscriptionRegistry;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.EnumMap;
import java.util.Map;

@Component
public final class ActiveConnectionLifecycleInterceptor
        implements ChannelInterceptor {

    private static final Logger log = LoggerFactory.getLogger(
            ActiveConnectionLifecycleInterceptor.class);
    private static final String REPLACEMENT_CLOSE_METRIC =
            "websocket.connections.replacement_close";

    private final ActiveConnectionRegistry activeConnections;
    private final TransportSessionRegistry transportSessions;
    private final ChatSubscriptionRegistry subscriptions;
    private final Counter replacedCounter;
    private final Map<TransportSessionCloseResult, Counter>
            replacementCloseCounters;

    public ActiveConnectionLifecycleInterceptor(
            ActiveConnectionRegistry activeConnections,
            TransportSessionRegistry transportSessions,
            ChatSubscriptionRegistry subscriptions,
            MeterRegistry meterRegistry
    ) {
        this.activeConnections = activeConnections;
        this.transportSessions = transportSessions;
        this.subscriptions = subscriptions;
        this.replacedCounter =
                meterRegistry.counter("websocket.connections.replaced");
        this.replacementCloseCounters =
                new EnumMap<>(TransportSessionCloseResult.class);
        for (TransportSessionCloseResult result
                : TransportSessionCloseResult.values()) {
            replacementCloseCounters.put(
                    result,
                    Counter.builder(REPLACEMENT_CLOSE_METRIC)
                            .tag("result", metricResult(result))
                            .register(meterRegistry));
        }
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
            TransportSessionCloseResult closeResult =
                    transportSessions.close(
                            replaced,
                            TransportSessionRegistry.CONNECTION_REPLACED);
            BestEffortMetricRecorder.increment(
                    REPLACEMENT_CLOSE_METRIC,
                    replacementCloseCounters.get(closeResult));
            handleReplacementClose(replaced, closeResult);
        }
    }

    private void handleReplacementClose(
            String replacedConnectionId,
            TransportSessionCloseResult closeResult
    ) {
        if (closeResult
                == TransportSessionCloseResult.ALREADY_CLOSED_OR_MISSING) {
            subscriptions.removeAll(replacedConnectionId);
            activeConnections
                    .findUserIdByConnection(replacedConnectionId)
                    .ifPresent(userId -> activeConnections.deactivate(
                            userId,
                            replacedConnectionId));
            transportSessions.remove(replacedConnectionId);
            return;
        }
        if (closeResult == TransportSessionCloseResult.FAILED) {
            log.warn(
                    "Replaced WebSocket connection close failed; tracking is retained for later revocation");
        }
    }

    private static String metricResult(
            TransportSessionCloseResult result
    ) {
        return switch (result) {
            case CLOSED -> "closed";
            case ALREADY_CLOSED_OR_MISSING ->
                    "already_closed_or_missing";
            case FAILED -> "failed";
        };
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
