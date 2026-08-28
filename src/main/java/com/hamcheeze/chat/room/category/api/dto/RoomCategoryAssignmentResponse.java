package com.hamcheeze.chat.room.category.api.dto;

import com.hamcheeze.chat.room.category.RoomCategoryAssignment;

import java.util.List;
import java.util.Objects;

public record RoomCategoryAssignmentResponse(
        String roomId,
        List<String> categoryIds,
        long roomVersion,
        boolean changed
) {

    public RoomCategoryAssignmentResponse {
        Objects.requireNonNull(roomId, "roomId");
        categoryIds = List.copyOf(
                Objects.requireNonNull(categoryIds, "categoryIds"));
    }

    public static RoomCategoryAssignmentResponse from(
            RoomCategoryAssignment assignment
    ) {
        RoomCategoryAssignment source = Objects.requireNonNull(
                assignment,
                "assignment");
        return new RoomCategoryAssignmentResponse(
                source.room().roomId(),
                source.room().categoryIds(),
                source.room().version(),
                source.changed());
    }
}
