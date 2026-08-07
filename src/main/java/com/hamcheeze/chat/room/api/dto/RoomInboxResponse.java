package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.inbox.model.RoomInboxView;

import java.time.Instant;
import java.util.List;

public record RoomInboxResponse(
        String roomId,
        String name,
        String description,
        List<RoomCategory> categories,
        String ownerMembershipId,
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
        long membershipVersion,
        long readThroughSequence,
        int unreadCount,
        boolean unreadCountCapped,
        RoomInboxLastMessageResponse lastMessage,
        Instant lastActivityAt
) {
    public static RoomInboxResponse from(RoomInboxView view) {
        return new RoomInboxResponse(
                view.roomId(),
                view.name(),
                view.description(),
                view.categories(),
                view.ownerMembershipId(),
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
                view.membershipVersion(),
                view.readThroughSequence(),
                view.unreadCount(),
                view.unreadCountCapped(),
                RoomInboxLastMessageResponse.from(
                        view.lastMessage()),
                view.lastActivityAt());
    }
}
