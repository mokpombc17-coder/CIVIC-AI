package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.category.RoomCategoryIds;

import java.util.List;
import java.util.Locale;

public record AdminRoomQueryCriteria(
        String nameContains,
        String categoryId,
        RoomStatus status,
        RoomVisibility visibility
) {

    public static final int MAX_NAME_QUERY_CODE_POINTS = 100;

    public AdminRoomQueryCriteria {
        nameContains = canonicalNameContains(nameContains);
        if (categoryId != null) {
            categoryId = RoomCategoryIds.requireValid(
                    List.of(categoryId)).getFirst();
        }
    }

    private static String canonicalNameContains(String query) {
        if (query == null) {
            return null;
        }
        if (query.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(
                    "name query must not contain control characters");
        }
        String canonical = query.strip();
        if (canonical.isEmpty()) {
            return null;
        }
        if (canonical.codePointCount(0, canonical.length())
                > MAX_NAME_QUERY_CODE_POINTS) {
            throw new IllegalArgumentException(
                    "name query must not exceed 100 code points");
        }
        return canonical.toLowerCase(Locale.ROOT);
    }
}
