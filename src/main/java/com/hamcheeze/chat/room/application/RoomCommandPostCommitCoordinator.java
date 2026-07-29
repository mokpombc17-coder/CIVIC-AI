package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.application.access.RoomCommandAccessRevocationCoordinator;
import com.hamcheeze.chat.room.application.event.RoomCommandEventPropagationCoordinator;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;

import java.util.Objects;

public final class RoomCommandPostCommitCoordinator {

    private final RoomCommandEventPropagationCoordinator
            eventPropagationCoordinator;
    private final RoomCommandAccessRevocationCoordinator
            accessRevocationCoordinator;

    public RoomCommandPostCommitCoordinator(
            RoomCommandEventPropagationCoordinator
                    eventPropagationCoordinator,
            RoomCommandAccessRevocationCoordinator
                    accessRevocationCoordinator
    ) {
        this.eventPropagationCoordinator = Objects.requireNonNull(
                eventPropagationCoordinator,
                "eventPropagationCoordinator");
        this.accessRevocationCoordinator = Objects.requireNonNull(
                accessRevocationCoordinator,
                "accessRevocationCoordinator");
    }

    public static RoomCommandPostCommitCoordinator disabled() {
        return new RoomCommandPostCommitCoordinator(
                RoomCommandEventPropagationCoordinator.disabled(),
                RoomCommandAccessRevocationCoordinator.disabled());
    }

    public void afterCommand(RoomCommandExecution execution) {
        eventPropagationCoordinator.afterCommand(execution);
        accessRevocationCoordinator.afterCommand(execution);
    }
}
