package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.category.RoomCategoryIds;

import java.util.List;
import java.util.Locale;

public record ListedRoomQueryCriteria(
        String nameContains,
        String categoryId,
        JoinPolicy joinPolicy
) {

    public static final int MAX_NAME_QUERY_CODE_POINTS = 100;

    public ListedRoomQueryCriteria {
        nameContains = canonicalNameContains(nameContains);
        if (categoryId != null) {
            categoryId = RoomCategoryIds.requireValid(
                    List.of(categoryId)).getFirst();
        }
    }

    public boolean unfiltered() {
        return nameContains == null
                && categoryId == null
                && joinPolicy == null;
    }

    private static String canonicalNameContains(String query) {
        if (query == null) {
            return null;
        }
        if (query.codePoints().anyMatch(
                Character::isISOControl)) {
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
