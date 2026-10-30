package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;

public record CreateRoomResponse(
        String clientRequestId,
        RoomCommandResultCode code,
        boolean replayed,
        String roomId,
        String ownerMembershipId,
        long roomVersion,
        long ownerMembershipVersion
) {
}
