package com.hamcheeze.chat.room.query.model;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;

import java.time.Instant;
import java.util.List;

public record AdminRoomView(
        String roomId,
        String name,
        String description,
        List<String> categoryIds,
        String ownerMembershipId,
        RoomStatus status,
        RoomVisibility visibility,
        JoinPolicy joinPolicy,
        int activeMemberCount,
        Instant createdAt,
        long version
) {
}
