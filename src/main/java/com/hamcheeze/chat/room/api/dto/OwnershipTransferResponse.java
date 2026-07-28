package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;

public record OwnershipTransferResponse(
        String clientRequestId,
        RoomCommandResultCode code,
        boolean replayed,
        String roomId,
        String previousOwnerUserId,
        String newOwnerUserId,
        String previousOwnerMembershipId,
        String newOwnerMembershipId,
        long roomVersion,
        long previousOwnerMembershipVersion,
        long newOwnerMembershipVersion
) {
}
