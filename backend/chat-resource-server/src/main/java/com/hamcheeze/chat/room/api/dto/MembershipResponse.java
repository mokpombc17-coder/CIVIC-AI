package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.query.model.MembershipView;

import java.time.Instant;

public record MembershipResponse(
        String membershipId,
        String roomId,
        MembershipRole role,
        MembershipStatus status,
        Instant joinedAt,
        Instant leftAt,
        Instant bannedAt,
        long version
) {

    public static MembershipResponse from(MembershipView view) {
        return new MembershipResponse(
                view.membershipId(),
                view.roomId(),
                view.role(),
                view.status(),
                view.joinedAt(),
                view.leftAt(),
                view.bannedAt(),
                view.version());
    }
}
