package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;

public record TargetMembershipCommandResponse(
        String clientRequestId,
        RoomCommandResultCode code,
        boolean replayed,
        String roomId,
        String targetUserId,
        String targetMembershipId,
        long roomVersion,
        long membershipVersion
) {
}
