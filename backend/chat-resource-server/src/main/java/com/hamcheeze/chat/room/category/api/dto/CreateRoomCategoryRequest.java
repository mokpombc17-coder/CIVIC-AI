package com.hamcheeze.chat.room.category.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateRoomCategoryRequest(
        @NotBlank String name
) {
}
