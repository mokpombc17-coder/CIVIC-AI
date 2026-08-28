package com.hamcheeze.chat.room.category.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record RenameRoomCategoryRequest(
        @NotBlank String name,
        @NotNull @PositiveOrZero Long expectedVersion
) {
}
