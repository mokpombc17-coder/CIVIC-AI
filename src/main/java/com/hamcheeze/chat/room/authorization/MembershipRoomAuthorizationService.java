package com.hamcheeze.chat.room.authorization;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.EnumMap;
import java.util.Map;
import java.util.regex.Pattern;

public final class MembershipRoomAuthorizationService
        implements RoomAuthorizationService {

    private static final Logger log = LoggerFactory.getLogger(
            MembershipRoomAuthorizationService.class);
    private static final Pattern ROOM_ID =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");
    private static final String METRIC_NAME =
            "room.authorization.decisions";

    private final RoomAccessReader accessReader;
    private final Map<Operation, Map<RoomAuthorizationDecision, Counter>>
            counters = new EnumMap<>(Operation.class);

    public MembershipRoomAuthorizationService(
            RoomAccessReader accessReader,
            MeterRegistry meterRegistry
    ) {
        this.accessReader = accessReader;
        for (Operation operation : Operation.values()) {
            Map<RoomAuthorizationDecision, Counter> decisions =
                    new EnumMap<>(RoomAuthorizationDecision.class);
            for (RoomAuthorizationDecision decision
                    : RoomAuthorizationDecision.values()) {
                decisions.put(
                        decision,
                        Counter.builder(METRIC_NAME)
                                .tag("operation", operation.tag)
                                .tag("decision",
                                        decision.name().toLowerCase())
                                .register(meterRegistry));
            }
            counters.put(operation, decisions);
        }
    }

    @Override
    public RoomAuthorizationDecision authorizeSubscription(
            String userId,
            String roomId
    ) {
        return authorize(Operation.SUBSCRIPTION, userId, roomId);
    }

    @Override
    public RoomAuthorizationDecision authorizeMessageSend(
            String userId,
            String roomId
    ) {
        return authorize(Operation.SEND, userId, roomId);
    }

    private RoomAuthorizationDecision authorize(
            Operation operation,
            String userId,
            String roomId
    ) {
        RoomAuthorizationDecision decision;
        if (invalid(userId) || invalidRoomId(roomId)) {
            decision = RoomAuthorizationDecision.FORBIDDEN;
        } else {
            try {
                RoomAccessSnapshot snapshot =
                        accessReader.readAccess(userId, roomId);
                decision = snapshot.semanticallyValid()
                        ? map(snapshot.state())
                        : RoomAuthorizationDecision.UNAVAILABLE;
            } catch (RuntimeException exception) {
                log.warn(
                        "Room authorization unavailable: operation={}, roomId={}, cause={}",
                        operation.tag,
                        roomId,
                        exception.getClass().getSimpleName());
                decision = RoomAuthorizationDecision.UNAVAILABLE;
            }
        }
        BestEffortMetricRecorder.increment(
                METRIC_NAME,
                counters.get(operation).get(decision));
        return decision;
    }

    private static RoomAuthorizationDecision map(
            RoomAccessState state
    ) {
        return state == RoomAccessState.ACTIVE_MEMBER
                ? RoomAuthorizationDecision.ALLOWED
                : RoomAuthorizationDecision.FORBIDDEN;
    }

    private static boolean invalid(String value) {
        return value == null || value.isBlank();
    }

    private static boolean invalidRoomId(String roomId) {
        return invalid(roomId) || !ROOM_ID.matcher(roomId).matches();
    }

    private enum Operation {
        SUBSCRIPTION("subscription"),
        SEND("send");

        private final String tag;

        Operation(String tag) {
            this.tag = tag;
        }
    }
}
