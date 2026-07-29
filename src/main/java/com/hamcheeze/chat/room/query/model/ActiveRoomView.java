package com.hamcheeze.chat.room.query.model;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;

import java.time.Instant;

public record ActiveRoomView(
        String roomId,
        String name,
        String ownerUserId,
        RoomStatus status,
        RoomVisibility visibility,
        JoinPolicy joinPolicy,
        int activeMemberCount,
        Instant createdAt,
        long version,
        String membershipId,
        MembershipRole membershipRole,
        MembershipStatus membershipStatus,
        Instant joinedAt,
        long membershipVersion
) {
}
