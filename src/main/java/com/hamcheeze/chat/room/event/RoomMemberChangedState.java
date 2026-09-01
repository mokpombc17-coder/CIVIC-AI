package com.hamcheeze.chat.room.event;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;

import java.util.Objects;

public record RoomMemberChangedState(
        String membershipId,
        String userLabel,
        MembershipRole role,
        MembershipStatus status,
        long membershipVersion
) {

    public RoomMemberChangedState {
        membershipId = RoomEventValidation.requireText(
                membershipId,
                "membershipId");
        userLabel = RoomEventValidation.requireText(
                userLabel,
                "userLabel");
        Objects.requireNonNull(role, "role");
        Objects.requireNonNull(status, "status");
        membershipVersion = RoomEventValidation.requireVersion(
                membershipVersion,
                "membershipVersion");
    }
}
