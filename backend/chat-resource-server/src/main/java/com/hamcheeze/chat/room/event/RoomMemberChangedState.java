package com.hamcheeze.chat.room.event;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;

import java.util.Objects;

public record RoomMemberChangedState(
        String membershipId,
        String participationId,
        String userLabel,
        MembershipRole role,
        MembershipStatus status,
        long membershipVersion
) {

    public RoomMemberChangedState {
        membershipId = RoomEventValidation.requireText(
                membershipId,
                "membershipId");
        participationId = RoomEventValidation.requireText(
                participationId,
                "participationId");
        userLabel = RoomEventValidation.requireText(
                userLabel,
                "userLabel");
        Objects.requireNonNull(role, "role");
        Objects.requireNonNull(status, "status");
        membershipVersion = RoomEventValidation.requireVersion(
                membershipVersion,
                "membershipVersion");
    }

    public RoomMemberChangedState(
            String membershipId,
            String userLabel,
            MembershipRole role,
            MembershipStatus status,
            long membershipVersion
    ) {
        this(
                membershipId,
                com.hamcheeze.chat.room.RoomParticipationIds.legacy(
                        membershipId),
                userLabel,
                role,
                status,
                membershipVersion);
    }
}
