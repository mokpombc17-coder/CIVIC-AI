package com.hamcheeze.chat.room.application.command;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.persistence.RoomCommandType;

import java.util.Objects;

public record UpdateRoomSettingsCommand(
        String requesterUserId,
        String clientRequestId,
        String roomId,
        boolean namePresent,
        String name,
        boolean descriptionPresent,
        String description,
        boolean visibilityPresent,
        RoomVisibility visibility,
        boolean joinPolicyPresent,
        JoinPolicy joinPolicy
) implements RoomCommand {

    public UpdateRoomSettingsCommand {
        requesterUserId = RoomCommandValidation.requireNonBlank(
                requesterUserId,
                "requesterUserId");
        clientRequestId =
                RoomCommandValidation.clientRequestId(clientRequestId);
        roomId = RoomCommandValidation.requireNonBlank(
                roomId,
                "roomId");
        if (!namePresent
                && !descriptionPresent
                && !visibilityPresent
                && !joinPolicyPresent) {
            throw new IllegalArgumentException(
                    "settings patch must not be empty");
        }
        name = namePresent
                ? RoomCommandValidation.roomName(name)
                : requireAbsent(name, "name");
        description = descriptionPresent
                ? RoomCommandValidation.roomDescription(description)
                : requireAbsent(description, "description");
        visibility = visibilityPresent
                ? Objects.requireNonNull(visibility, "visibility")
                : requireAbsent(visibility, "visibility");
        joinPolicy = joinPolicyPresent
                ? Objects.requireNonNull(joinPolicy, "joinPolicy")
                : requireAbsent(joinPolicy, "joinPolicy");
    }

    @Override
    public RoomCommandType commandType() {
        return RoomCommandType.UPDATE_ROOM_SETTINGS;
    }

    private static <T> T requireAbsent(
            T value,
            String fieldName
    ) {
        if (value != null) {
            throw new IllegalArgumentException(
                    fieldName + " must be null when absent");
        }
        return null;
    }
}
