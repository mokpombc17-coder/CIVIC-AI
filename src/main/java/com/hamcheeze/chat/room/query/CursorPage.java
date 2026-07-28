package com.hamcheeze.chat.room.query;

import java.util.List;

public record CursorPage<T>(
        List<T> items,
        String nextCursor,
        boolean hasNext
) {

    public CursorPage {
        items = List.copyOf(items);
        if (hasNext && (nextCursor == null
                || nextCursor.isBlank())) {
            throw new IllegalArgumentException(
                    "nextCursor is required when hasNext is true");
        }
        if (!hasNext && nextCursor != null) {
            throw new IllegalArgumentException(
                    "nextCursor must be null on the last page");
        }
    }
}
