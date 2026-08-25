package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record ApprovedRoomCreation(
        String roomId,
        String ownerMembershipId,
        String ownerUserId,
        String name,
        String description,
        List<RoomCategory> categories,
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
        categories = List.copyOf(
                Objects.requireNonNull(categories, "categories"));
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
