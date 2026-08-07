package com.hamcheeze.chat.room.application.command;

import com.hamcheeze.chat.room.persistence.RoomCommandType;

public record TransferOwnershipCommand(
        String requesterUserId,
        String clientRequestId,
        String roomId,
        String targetUserId,
        String targetMembershipId
) implements RoomCommand {

    public TransferOwnershipCommand(
            String requesterUserId,
            String clientRequestId,
            String roomId,
            String targetUserId
    ) {
        this(
                requesterUserId,
                clientRequestId,
                roomId,
                targetUserId,
                null);
    }

    public TransferOwnershipCommand {
        requesterUserId = RoomCommandValidation.requireNonBlank(
                requesterUserId,
                "requesterUserId");
        clientRequestId =
                RoomCommandValidation.clientRequestId(clientRequestId);
        roomId = RoomCommandValidation.requireNonBlank(
                roomId,
                "roomId");
        RoomCommandValidation.requireExactlyOneTargetIdentity(
                targetUserId,
                targetMembershipId);
    }

    @Override
    public RoomCommandType commandType() {
        return RoomCommandType.TRANSFER_OWNERSHIP;
    }
}
