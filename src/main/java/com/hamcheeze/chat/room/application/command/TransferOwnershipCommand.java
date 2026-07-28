package com.hamcheeze.chat.room.application.command;

import com.hamcheeze.chat.room.persistence.RoomCommandType;

public record TransferOwnershipCommand(
        String requesterUserId,
        String clientRequestId,
        String roomId,
        String targetUserId
) implements RoomCommand {

    public TransferOwnershipCommand {
        requesterUserId = RoomCommandValidation.requireNonBlank(
                requesterUserId,
                "requesterUserId");
        clientRequestId =
                RoomCommandValidation.clientRequestId(clientRequestId);
        roomId = RoomCommandValidation.requireNonBlank(
                roomId,
                "roomId");
        targetUserId = RoomCommandValidation.requireNonBlank(
                targetUserId,
                "targetUserId");
    }

    @Override
    public RoomCommandType commandType() {
        return RoomCommandType.TRANSFER_OWNERSHIP;
    }
}
