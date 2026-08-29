package com.hamcheeze.chat.room.category.api.dto;

import com.hamcheeze.chat.room.category.RoomCategory;
import com.hamcheeze.chat.room.category.RoomCategoryDefaults;

import java.time.Instant;

public record AdminRoomCategoryResponse(
        String categoryId,
        String name,
        long usageCount,
        boolean deletable,
        Instant createdAt,
        Instant updatedAt,
        long version
) {

    public static AdminRoomCategoryResponse from(
            RoomCategory category,
            long usageCount
    ) {
        if (usageCount < 0) {
            throw new IllegalArgumentException(
                    "usageCount must not be negative");
        }
        return new AdminRoomCategoryResponse(
                category.categoryId(),
                category.name(),
                usageCount,
                usageCount == 0
                        && !RoomCategoryDefaults.POLICY_CATEGORY_ID.equals(
                                category.categoryId()),
                category.createdAt(),
                category.updatedAt(),
                category.version());
    }
}
