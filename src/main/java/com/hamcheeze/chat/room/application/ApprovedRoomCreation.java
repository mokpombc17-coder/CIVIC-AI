package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.category.RoomCategoryIds;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record ApprovedRoomCreation(
        String roomId,
        String ownerMembershipId,
        String ownerUserId,
        String name,
        String description,
        List<String> categoryIds,
        RoomVisibility visibility,
        JoinPolicy joinPolicy,
        Instant createdAt,
        ActiveRoomMembershipLimitMode limitMode
) {

    public ApprovedRoomCreation {
        roomId = requireNonBlank(roomId, "roomId");
        ownerMembershipId = requireNonBlank(
                ownerMembershipId,
                "ownerMembershipId");
        ownerUserId = requireNonBlank(
                ownerUserId,
                "ownerUserId");
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(description, "description");
        categoryIds = RoomCategoryIds.requireValid(categoryIds);
        Objects.requireNonNull(visibility, "visibility");
        Objects.requireNonNull(joinPolicy, "joinPolicy");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(limitMode, "limitMode");
    }

    private static String requireNonBlank(
            String value,
            String field
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
        return value;
    }
}
