package com.hamcheeze.chat.room.application.command;

import com.hamcheeze.chat.room.persistence.RoomCommandType;

public record JoinRoomCommand(
        String requesterUserId,
        String clientRequestId,
        String roomId
) implements RoomCommand {

    public JoinRoomCommand {
        requesterUserId = RoomCommandValidation.requireNonBlank(
                requesterUserId,
                "requesterUserId");
        clientRequestId =
                RoomCommandValidation.clientRequestId(clientRequestId);
        roomId = RoomCommandValidation.requireNonBlank(
                roomId,
                "roomId");
    }

    @Override
    public RoomCommandType commandType() {
        return RoomCommandType.JOIN_ROOM;
    }
}
