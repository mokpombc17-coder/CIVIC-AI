package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;

public record MembershipCommandResponse(
        String clientRequestId,
        RoomCommandResultCode code,
        boolean replayed,
        String roomId,
        String membershipId,
        long roomVersion,
        long membershipVersion
) {
}
