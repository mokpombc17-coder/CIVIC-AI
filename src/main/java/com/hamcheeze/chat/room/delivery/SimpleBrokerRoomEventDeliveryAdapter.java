package com.hamcheeze.chat.room.delivery;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryOutcome;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryPort;
import com.hamcheeze.chat.room.event.RoomEventEnvelope;
import com.hamcheeze.chat.room.event.RoomEventType;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public final class SimpleBrokerRoomEventDeliveryAdapter
        implements RoomEventDeliveryPort {

    private static final Logger log = LoggerFactory.getLogger(
            SimpleBrokerRoomEventDeliveryAdapter.class);
    private static final String METRIC_NAME = "room.events.delivery";

    private final SimpMessagingTemplate messagingTemplate;
    private final ActiveConnectionRegistry activeConnections;
    private final Map<String, Counter> counters = new HashMap<>();

    public SimpleBrokerRoomEventDeliveryAdapter(
            SimpMessagingTemplate messagingTemplate,
            ActiveConnectionRegistry activeConnections,
            MeterRegistry meterRegistry
    ) {
        this.messagingTemplate = Objects.requireNonNull(
                messagingTemplate,
                "messagingTemplate");
        this.activeConnections = Objects.requireNonNull(
                activeConnections,
                "activeConnections");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        for (String scope : new String[]{"room", "user"}) {
            for (RoomEventType eventType : RoomEventType.values()) {
                for (RoomEventDeliveryOutcome outcome
                        : RoomEventDeliveryOutcome.values()) {
                    counters.put(
                            key(scope, eventType, outcome),
                            Counter.builder(METRIC_NAME)
                                    .tag("scope", scope)
                                    .tag(
                                            "event_type",
                                            eventType.name().toLowerCase())
                                    .tag(
                                            "outcome",
                                            outcome.name().toLowerCase())
                                    .register(meterRegistry));
                }
            }
        }
    }

    @Override
    public RoomEventDeliveryOutcome publishToRoom(
            RoomEventEnvelope event
    ) {
        Objects.requireNonNull(event, "event");
        RoomEventDeliveryOutcome outcome;
        try {
            messagingTemplate.convertAndSend(
                    "/topic/rooms/"
                            + event.payload().roomId()
                            + "/room-events",
                    event);
            outcome = RoomEventDeliveryOutcome.ACCEPTED;
        } catch (RuntimeException exception) {
            outcome = RoomEventDeliveryOutcome.FAILED;
            logFailure(event, "room", exception);
        }
        record("room", event.eventType(), outcome);
        return outcome;
    }

    @Override
    public RoomEventDeliveryOutcome publishToUser(
            String userId,
            RoomEventEnvelope event
    ) {
        Objects.requireNonNull(event, "event");
        String connectionId = activeConnections
                .findConnectionIdByUser(userId)
                .orElse(null);
        if (connectionId == null
                || !activeConnections.isActive(userId, connectionId)) {
            RoomEventDeliveryOutcome outcome =
                    RoomEventDeliveryOutcome.NO_ACTIVE_CONNECTION;
            record("user", event.eventType(), outcome);
            return outcome;
        }

        RoomEventDeliveryOutcome outcome;
        try {
            SimpMessageHeaderAccessor headers =
                    SimpMessageHeaderAccessor.create();
            headers.setSessionId(connectionId);
            headers.setLeaveMutable(true);
            messagingTemplate.convertAndSendToUser(
                    userId,
                    "/queue/system-events",
                    event,
                    headers.getMessageHeaders());
            outcome = RoomEventDeliveryOutcome.ACCEPTED;
        } catch (RuntimeException exception) {
            outcome = RoomEventDeliveryOutcome.FAILED;
            logFailure(event, "user", exception);
        }
        record("user", event.eventType(), outcome);
        return outcome;
    }

    private void record(
            String scope,
            RoomEventType eventType,
            RoomEventDeliveryOutcome outcome
    ) {
        BestEffortMetricRecorder.increment(
                METRIC_NAME,
                counters.get(key(scope, eventType, outcome)));
    }

    private static String key(
            String scope,
            RoomEventType eventType,
            RoomEventDeliveryOutcome outcome
    ) {
        return scope + "|" + eventType + "|" + outcome;
    }

    private static void logFailure(
            RoomEventEnvelope event,
            String scope,
            RuntimeException exception
    ) {
        try {
            log.warn(
                    "Room event delivery failed: eventId={}, eventType={}, roomId={}, scope={}, exceptionClass={}",
                    event.eventId(),
                    event.eventType(),
                    event.payload().roomId(),
                    scope,
                    exception.getClass().getName());
        } catch (RuntimeException ignored) {
            // Observability failure must not affect command processing.
        }
    }
}
