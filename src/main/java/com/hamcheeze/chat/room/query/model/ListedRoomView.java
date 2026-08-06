package com.hamcheeze.chat.room.query.model;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;

import java.time.Instant;
import java.util.List;

public record ListedRoomView(
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
        long version
) {
}
