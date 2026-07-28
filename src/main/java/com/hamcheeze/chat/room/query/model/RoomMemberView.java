package com.hamcheeze.chat.room.query.model;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;

import java.time.Instant;

public record RoomMemberView(
        String membershipId,
        String userId,
        MembershipRole role,
        MembershipStatus status,
        Instant joinedAt,
        Instant leftAt,
        Instant bannedAt,
        long version
) {
}
