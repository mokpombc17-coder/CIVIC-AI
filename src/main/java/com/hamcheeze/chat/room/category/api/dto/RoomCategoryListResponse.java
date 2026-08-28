package com.hamcheeze.chat.room.category.api.dto;

import java.util.List;

public record RoomCategoryListResponse(
        List<RoomCategoryResponse> items
) {

    public RoomCategoryListResponse {
        items = List.copyOf(items);
    }
}
