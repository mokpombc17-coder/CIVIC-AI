package com.hamcheeze.chat.room.query.model;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;

import java.time.Instant;

public record MembershipView(
        String membershipId,
        String roomId,
        String userId,
        MembershipRole role,
        MembershipStatus status,
        Instant joinedAt,
        Instant leftAt,
        Instant bannedAt,
        long version
) {

    public static MembershipView from(Membership membership) {
        return new MembershipView(
                membership.membershipId(),
                membership.roomId(),
                membership.userId(),
                membership.role(),
                membership.status(),
                membership.joinedAt(),
                membership.leftAt(),
                membership.bannedAt(),
                membership.version());
    }
}
