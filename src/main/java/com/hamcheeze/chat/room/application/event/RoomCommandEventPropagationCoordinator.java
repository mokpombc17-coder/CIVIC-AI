package com.hamcheeze.chat.room.application.event;

import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.event.RoomEventDeliveryPlan;
import com.hamcheeze.chat.room.event.RoomEventEnvelope;
import com.hamcheeze.chat.room.event.RoomEventType;
import com.hamcheeze.chat.room.event.RoomSettingsUpdatedEventPayload;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.util.Objects;
import java.util.Set;

public final class RoomCommandEventPropagationCoordinator {

    private static final Logger log = LoggerFactory.getLogger(
            RoomCommandEventPropagationCoordinator.class);

    private final RoomCommandEventMapper mapper;
    private final RoomEventIdGenerator eventIdGenerator;
    private final Clock clock;
    private final RoomEventDeliveryPort deliveryPort;
    private final boolean disabled;

    public RoomCommandEventPropagationCoordinator(
            RoomCommandEventMapper mapper,
            RoomEventIdGenerator eventIdGenerator,
            Clock clock,
            RoomEventDeliveryPort deliveryPort
    ) {
        this(
                mapper,
                eventIdGenerator,
                clock,
                deliveryPort,
                false);
    }

    private RoomCommandEventPropagationCoordinator(
            RoomCommandEventMapper mapper,
            RoomEventIdGenerator eventIdGenerator,
            Clock clock,
            RoomEventDeliveryPort deliveryPort,
            boolean disabled
    ) {
        this.mapper = Objects.requireNonNull(mapper, "mapper");
        this.eventIdGenerator = Objects.requireNonNull(
                eventIdGenerator,
                "eventIdGenerator");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.deliveryPort =
                Objects.requireNonNull(deliveryPort, "deliveryPort");
        this.disabled = disabled;
    }

    public static RoomCommandEventPropagationCoordinator disabled() {
        return new RoomCommandEventPropagationCoordinator(
                RoomCommandEventMapper.disabled(),
                () -> "00000000-0000-0000-0000-000000000000",
                Clock.systemUTC(),
                new RoomEventDeliveryPort() {
                    @Override
                    public RoomEventDeliveryOutcome publishToRoom(
                            RoomEventEnvelope event
                    ) {
                        return RoomEventDeliveryOutcome.ACCEPTED;
                    }

                    @Override
                    public RoomEventDeliveryOutcome publishToUser(
                            String userId,
                            RoomEventEnvelope event
                    ) {
                        return RoomEventDeliveryOutcome.ACCEPTED;
                    }
                },
                true);
    }

    public void afterCommand(RoomCommandExecution execution) {
        if (disabled) {
            return;
        }
        try {
            if (!mapper.supports(execution)) {
                return;
            }
            RoomEventDeliveryPlan plan = mapper.map(
                            execution,
                            eventIdGenerator.newEventId(),
                            clock.instant())
                    .orElse(null);
            if (plan == null) {
                return;
            }
            publishRoom(plan);
            for (String userId : plan.userRecipients()) {
                publishUser(userId, plan.event());
            }
        } catch (RuntimeException exception) {
            logFailure(null, "mapping", exception);
        }
    }

    public void afterRoomCategoriesChanged(Room room) {
        Objects.requireNonNull(room, "room");
        if (disabled || room.status() != RoomStatus.ACTIVE) {
            return;
        }
        try {
            RoomEventDeliveryPlan plan = new RoomEventDeliveryPlan(
                    new RoomEventEnvelope(
                            RoomEventEnvelope.CURRENT_VERSION,
                            eventIdGenerator.newEventId(),
                            RoomEventType.ROOM_SETTINGS_UPDATED,
                            clock.instant(),
                            new RoomSettingsUpdatedEventPayload(
                                    room.roomId(),
                                    room.version(),
                                    room.status(),
                                    room.name(),
                                    room.description(),
                                    room.categoryIds(),
                                    room.visibility(),
                                    room.joinPolicy())),
                    Set.of());
            publishRoom(plan);
        } catch (RuntimeException exception) {
            logFailure(null, "mapping", exception);
        }
    }

    private void publishRoom(RoomEventDeliveryPlan plan) {
        try {
            deliveryPort.publishToRoom(plan.event());
        } catch (RuntimeException exception) {
            logFailure(plan.event(), "room", exception);
        }
    }

    private void publishUser(
            String userId,
            RoomEventEnvelope event
    ) {
        try {
            deliveryPort.publishToUser(userId, event);
        } catch (RuntimeException exception) {
            logFailure(event, "user", exception);
        }
    }

    private static void logFailure(
            RoomEventEnvelope event,
            String scope,
            RuntimeException exception
    ) {
        try {
            if (event == null) {
                log.warn(
                        "Room event mapping failed: scope={}, exceptionClass={}",
                        scope,
                        exception.getClass().getName());
                return;
            }
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
