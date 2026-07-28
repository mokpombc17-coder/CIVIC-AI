package com.hamcheeze.chat.room.application.access;

public interface RoomAccessRevocationPort {

    RoomAccessRevocationSummary revokeUserRoomAccess(
            String userId,
            String roomId,
            RoomAccessRevocationReason reason
    );

    RoomAccessRevocationSummary revokeRoomAccess(
            String roomId,
            RoomAccessRevocationReason reason
    );
}
