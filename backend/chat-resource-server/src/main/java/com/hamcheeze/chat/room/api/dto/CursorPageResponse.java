package com.hamcheeze.chat.room.api.dto;

import java.util.List;

public record CursorPageResponse<T>(
        List<T> items,
        String nextCursor,
        boolean hasNext
) {

    public CursorPageResponse {
        items = List.copyOf(items);
    }
}
