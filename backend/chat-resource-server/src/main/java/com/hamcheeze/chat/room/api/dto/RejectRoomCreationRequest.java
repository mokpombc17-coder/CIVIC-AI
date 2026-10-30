package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.api.validation.ValidRoomCreationRejectionReason;
import com.hamcheeze.chat.room.creation.RoomCreationRejectionReason;

public record RejectRoomCreationRequest(
        @ValidRoomCreationRejectionReason
        String reason
) {

    public RejectRoomCreationRequest {
        reason = RoomCreationRejectionReason.canonicalize(reason);
    }
}
