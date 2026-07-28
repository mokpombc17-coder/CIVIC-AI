package com.hamcheeze.chat.room.application.command;

import com.hamcheeze.chat.room.persistence.RoomCommandType;

public sealed interface RoomCommand permits
        CreateRoomCommand,
        JoinRoomCommand,
        LeaveRoomCommand,
        TransferOwnershipCommand,
        BanMemberCommand,
        UnbanMemberCommand,
        CloseRoomCommand {

    String requesterUserId();

    String clientRequestId();

    RoomCommandType commandType();
}
