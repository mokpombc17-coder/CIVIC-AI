package com.hamcheeze.chat.room.query;

import java.util.List;

public record CursorSlice<T>(
        List<T> items,
        boolean hasNext
) {

    public CursorSlice {
        items = List.copyOf(items);
    }
}
