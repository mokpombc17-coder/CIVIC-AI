package com.hamcheeze.chat.room.application.command;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.persistence.RoomCommandType;

import java.util.Objects;

public record CreateRoomCommand(
        String requesterUserId,
        String clientRequestId,
        RoomVisibility visibility,
        JoinPolicy joinPolicy
) implements RoomCommand {

    public CreateRoomCommand {
        requesterUserId = RoomCommandValidation.requireNonBlank(
                requesterUserId,
                "requesterUserId");
        clientRequestId =
                RoomCommandValidation.clientRequestId(clientRequestId);
        Objects.requireNonNull(visibility, "visibility");
        Objects.requireNonNull(joinPolicy, "joinPolicy");
    }

    @Override
    public RoomCommandType commandType() {
        return RoomCommandType.CREATE_ROOM;
    }
}
