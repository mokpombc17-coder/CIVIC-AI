package com.hamcheeze.chat.room.application;

import java.time.Instant;

public interface ActiveRoomMembershipQuotaGuard {

    ActiveRoomMembershipQuotaDecision checkBeforeIncrease(
            String userId,
            int maxActiveRooms,
            Instant transitionTime
    );
}
