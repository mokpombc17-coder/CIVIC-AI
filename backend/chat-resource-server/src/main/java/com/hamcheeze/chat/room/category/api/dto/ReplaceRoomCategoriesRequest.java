package com.hamcheeze.chat.room.category.api.dto;

import com.hamcheeze.chat.room.category.RoomCategoryIds;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ReplaceRoomCategoriesRequest(
        @NotNull
        @Size(
                min = RoomCategoryIds.MIN_SELECTIONS,
                max = RoomCategoryIds.MAX_SELECTIONS)
        List<@NotBlank String> categoryIds,
        @NotNull @PositiveOrZero Long expectedVersion
) {

    public ReplaceRoomCategoriesRequest {
        if (categoryIds != null) {
            categoryIds = RoomCategoryIds.requireValid(categoryIds);
        }
    }
}
