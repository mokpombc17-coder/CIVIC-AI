package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.category.RoomCategoryIds;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ApproveRoomCreationRequest(
        @NotNull
        @Size(
                min = RoomCategoryIds.MIN_SELECTIONS,
                max = RoomCategoryIds.MAX_SELECTIONS)
        List<@NotBlank String> categoryIds
) {

    public ApproveRoomCreationRequest {
        if (categoryIds != null) {
            categoryIds = RoomCategoryIds.requireValid(categoryIds);
        }
    }
}
