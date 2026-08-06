package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.model.ActiveRoomView;

import java.time.Instant;
import java.util.List;

public record ActiveRoomResponse(
        String roomId,
        String name,
        String description,
        List<RoomCategory> categories,
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

    public static ActiveRoomResponse from(ActiveRoomView view) {
        return new ActiveRoomResponse(
                view.roomId(),
                view.name(),
                view.description(),
                view.categories(),
                view.ownerUserId(),
                view.status(),
                view.visibility(),
                view.joinPolicy(),
                view.activeMemberCount(),
                view.createdAt(),
                view.version(),
                view.membershipId(),
                view.membershipRole(),
                view.membershipStatus(),
                view.joinedAt(),
                view.membershipVersion());
    }
}
