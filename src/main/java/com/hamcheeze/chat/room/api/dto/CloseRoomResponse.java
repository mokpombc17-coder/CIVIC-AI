package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;

public record CloseRoomResponse(
        String clientRequestId,
        RoomCommandResultCode code,
        boolean replayed,
        String roomId,
        String ownerMembershipId,
        String ownerUserId,
        long roomVersion,
        long ownerMembershipVersion
) {
}
