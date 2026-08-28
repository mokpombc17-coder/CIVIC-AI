package com.hamcheeze.chat.export;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;

import java.time.Instant;
import java.util.List;

public record ChatExportRoomSnapshot(
        String roomId,
        String name,
        String description,
        List<String> categoryIds,
        RoomStatus status,
        RoomVisibility visibility,
        JoinPolicy joinPolicy,
        String ownerMembershipId,
        long roomVersion,
        Instant createdAt,
        Instant closedAt,
        Instant capturedAt
) {
}
