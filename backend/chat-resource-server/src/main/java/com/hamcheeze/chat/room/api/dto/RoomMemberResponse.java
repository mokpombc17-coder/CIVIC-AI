package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.query.model.RoomMemberView;

import java.time.Instant;

public record RoomMemberResponse(
        String membershipId,
        String userLabel,
        long enteredAfterMessageSequence,
        String displayName,
        String imageUrl,
        long profileVersion,
        MembershipRole role,
        MembershipStatus status,
        Instant joinedAt,
        Instant leftAt,
        Instant bannedAt,
        long version
) {

    public static RoomMemberResponse from(RoomMemberView view) {
        return new RoomMemberResponse(
                view.membershipId(),
                view.userLabel(),
                view.enteredAfterMessageSequence(),
                view.displayName(),
                view.imageUrl(),
                view.profileVersion(),
                view.role(),
                view.status(),
                view.joinedAt(),
                view.leftAt(),
                view.bannedAt(),
                view.version());
    }

}
