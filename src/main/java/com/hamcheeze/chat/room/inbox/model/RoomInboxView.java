package com.hamcheeze.chat.room.inbox.model;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;

import java.time.Instant;
import java.util.List;

public record RoomInboxView(
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
        long membershipVersion,
        long readThroughSequence,
        int unreadCount,
        boolean unreadCountCapped,
        RoomInboxLastMessage lastMessage,
        Instant lastActivityAt
) {
}
