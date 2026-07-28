package com.hamcheeze.chat.websocket.access;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationPort;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationReason;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationSummary;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.connection.TransportSessionCloseResult;
import com.hamcheeze.chat.websocket.connection.TransportSessionRegistry;
import com.hamcheeze.chat.websocket.subscription.ChatSubscriptionRegistry;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.CloseStatus;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

public final class WebSocketRoomAccessRevoker
        implements RoomAccessRevocationPort {

    public static final CloseStatus ROOM_ACCESS_REVOKED =
            new CloseStatus(4002, "ROOM_ACCESS_REVOKED");
    public static final CloseStatus ROOM_CLOSED =
            new CloseStatus(4003, "ROOM_CLOSED");

    private static final Logger log = LoggerFactory.getLogger(
            WebSocketRoomAccessRevoker.class);
    private static final String METRIC_NAME =
            "websocket.room_access.revocations";

    private final ActiveConnectionRegistry activeConnections;
    private final ChatSubscriptionRegistry subscriptions;
    private final TransportSessionRegistry transportSessions;
    private final Map<String, Counter> counters = new HashMap<>();

    public WebSocketRoomAccessRevoker(
            ActiveConnectionRegistry activeConnections,
            ChatSubscriptionRegistry subscriptions,
            TransportSessionRegistry transportSessions,
            MeterRegistry meterRegistry
    ) {
        this.activeConnections = activeConnections;
        this.subscriptions = subscriptions;
        this.transportSessions = transportSessions;
        for (String scope : Set.of("user", "room")) {
            for (RoomAccessRevocationReason reason
                    : RoomAccessRevocationReason.values()) {
                for (String result : Set.of(
                        "success",
                        "noop",
                        "partial_failure",
                        "failure")) {
                    counters.put(
                            key(scope, reason, result),
                            Counter.builder(METRIC_NAME)
                                    .tag("scope", scope)
                                    .tag("reason", reason.name()
                                            .toLowerCase())
                                    .tag("result", result)
                                    .register(meterRegistry));
                }
            }
        }
    }

    @Override
    public RoomAccessRevocationSummary revokeUserRoomAccess(
            String userId,
            String roomId,
            RoomAccessRevocationReason reason
    ) {
        RoomAccessRevocationSummary summary =
                closeConnections(
                        subscriptions.findConnectionIdsByUserAndRoom(
                                userId,
                                roomId),
                        closeStatus(reason));
        record("user", reason, summary);
        log(reason, roomId, summary);
        return summary;
    }

    @Override
    public RoomAccessRevocationSummary revokeRoomAccess(
            String roomId,
            RoomAccessRevocationReason reason
    ) {
        RoomAccessRevocationSummary summary =
                closeConnections(
                        subscriptions.findConnectionIdsByRoom(roomId),
                        closeStatus(reason));
        record("room", reason, summary);
        log(reason, roomId, summary);
        return summary;
    }

    private RoomAccessRevocationSummary closeConnections(
            Set<String> connectionIds,
            CloseStatus closeStatus
    ) {
        int closed = 0;
        int alreadyClosedOrMissing = 0;
        int failed = 0;
        for (String connectionId : connectionIds) {
            TransportSessionCloseResult result =
                    transportSessions.close(connectionId, closeStatus);
            if (result == TransportSessionCloseResult.FAILED) {
                failed++;
                continue;
            }
            if (result == TransportSessionCloseResult.CLOSED) {
                closed++;
            } else {
                alreadyClosedOrMissing++;
            }
            cleanup(connectionId);
        }
        return new RoomAccessRevocationSummary(
                connectionIds.size(),
                closed,
                alreadyClosedOrMissing,
                failed);
    }

    private void cleanup(String connectionId) {
        subscriptions.removeAll(connectionId);
        activeConnections.findUserIdByConnection(connectionId)
                .ifPresent(userId -> activeConnections.deactivate(
                        userId,
                        connectionId));
        transportSessions.remove(connectionId);
    }

    private void record(
            String scope,
            RoomAccessRevocationReason reason,
            RoomAccessRevocationSummary summary
    ) {
        BestEffortMetricRecorder.increment(
                METRIC_NAME,
                counters.get(key(scope, reason, result(summary))));
    }

    private static String result(
            RoomAccessRevocationSummary summary
    ) {
        if (summary.matchedConnections() == 0) {
            return "noop";
        }
        if (summary.failedConnections() == 0) {
            return "success";
        }
        if (summary.failedConnections()
                == summary.matchedConnections()) {
            return "failure";
        }
        return "partial_failure";
    }

    private static String key(
            String scope,
            RoomAccessRevocationReason reason,
            String result
    ) {
        return scope + "|" + reason + "|" + result;
    }

    private static CloseStatus closeStatus(
            RoomAccessRevocationReason reason
    ) {
        return reason == RoomAccessRevocationReason.ROOM_CLOSED
                ? ROOM_CLOSED
                : ROOM_ACCESS_REVOKED;
    }

    private static void log(
            RoomAccessRevocationReason reason,
            String roomId,
            RoomAccessRevocationSummary summary
    ) {
        log.info(
                "Room access revocation: reason={}, roomId={}, matchedConnections={}, closedConnections={}, failedConnections={}",
                reason,
                roomId,
                summary.matchedConnections(),
                summary.closedConnections(),
                summary.failedConnections());
    }
}
