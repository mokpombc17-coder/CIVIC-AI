package com.hamcheeze.chat.room.query.model;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.RoomParticipationStatus;

import java.time.Instant;

public record RoomDetailView(
        String roomId,
        String ownerUserId,
        RoomStatus status,
        RoomVisibility visibility,
        JoinPolicy joinPolicy,
        int activeMemberCount,
        Instant createdAt,
        Instant closedAt,
        long version,
        RoomParticipationStatus participationStatus,
        MembershipView myMembership
) {
}
