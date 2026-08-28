package com.hamcheeze.chat.room.category.api.dto;

import com.hamcheeze.chat.room.category.RoomCategory;

import java.time.Instant;

public record RoomCategoryResponse(
        String categoryId,
        String name,
        Instant createdAt,
        Instant updatedAt,
        long version
) {

    public static RoomCategoryResponse from(RoomCategory category) {
        return new RoomCategoryResponse(
                category.categoryId(),
                category.name(),
                category.createdAt(),
                category.updatedAt(),
                category.version());
    }
}
