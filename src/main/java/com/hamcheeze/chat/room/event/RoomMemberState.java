package com.hamcheeze.chat.room.event;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;

import java.util.Objects;

public record RoomMemberState(
        String membershipId,
        String userId,
        MembershipRole role,
        MembershipStatus status,
        long membershipVersion
) {

    public RoomMemberState {
        membershipId = RoomEventValidation.requireText(
                membershipId,
                "membershipId");
        userId = RoomEventValidation.requireText(
                userId,
                "userId");
        Objects.requireNonNull(role, "role");
        Objects.requireNonNull(status, "status");
        membershipVersion = RoomEventValidation.requireVersion(
                membershipVersion,
                "membershipVersion");
    }
}
