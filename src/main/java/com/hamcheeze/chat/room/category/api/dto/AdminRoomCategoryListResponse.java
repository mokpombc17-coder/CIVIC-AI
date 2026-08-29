package com.hamcheeze.chat.room.category.api.dto;

import java.util.List;

public record AdminRoomCategoryListResponse(
        List<AdminRoomCategoryResponse> items
) {

    public AdminRoomCategoryListResponse {
        items = List.copyOf(items);
    }
}
