package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.application.access.RoomCommandAccessRevocationCoordinator;
import com.hamcheeze.chat.room.application.event.PublicRoomListInvalidationPort;
import com.hamcheeze.chat.room.application.event.RoomCommandEventPropagationCoordinator;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;

import java.util.Objects;

public final class RoomCommandPostCommitCoordinator {

    private final RoomCommandEventPropagationCoordinator
            eventPropagationCoordinator;
    private final RoomCommandAccessRevocationCoordinator
            accessRevocationCoordinator;
    private final PublicRoomListInvalidationPort publicRoomListInvalidation;

    public RoomCommandPostCommitCoordinator(
            RoomCommandEventPropagationCoordinator
                    eventPropagationCoordinator,
            RoomCommandAccessRevocationCoordinator
                    accessRevocationCoordinator,
            PublicRoomListInvalidationPort publicRoomListInvalidation
    ) {
        this.eventPropagationCoordinator = Objects.requireNonNull(
                eventPropagationCoordinator,
                "eventPropagationCoordinator");
        this.accessRevocationCoordinator = Objects.requireNonNull(
                accessRevocationCoordinator,
                "accessRevocationCoordinator");
        this.publicRoomListInvalidation = Objects.requireNonNull(
                publicRoomListInvalidation,
                "publicRoomListInvalidation");
    }

    public static RoomCommandPostCommitCoordinator disabled() {
        return new RoomCommandPostCommitCoordinator(
                RoomCommandEventPropagationCoordinator.disabled(),
                RoomCommandAccessRevocationCoordinator.disabled(),
                PublicRoomListInvalidationPort.disabled());
    }

    public void afterCommand(RoomCommandExecution execution) {
        eventPropagationCoordinator.afterCommand(execution);
        // Before access revocation, which may throw after the commit.
        if (mayChangePublicRoomList(execution)) {
            publicRoomListInvalidation.requestInvalidation();
        }
        accessRevocationCoordinator.afterCommand(execution);
    }

    public void afterRoomCategoriesChanged(Room room) {
        eventPropagationCoordinator.afterRoomCategoriesChanged(room);
        publicRoomListInvalidation.requestInvalidation();
    }

    private static boolean mayChangePublicRoomList(
            RoomCommandExecution execution
    ) {
        if (execution.replayed()) {
            return false;
        }
        RoomCommandResultCode code = execution.result().code();
        return code == RoomCommandResultCode.ROOM_CREATED
                || code == RoomCommandResultCode.CLOSED
                || code == RoomCommandResultCode.ROOM_SETTINGS_UPDATED;
    }
}
