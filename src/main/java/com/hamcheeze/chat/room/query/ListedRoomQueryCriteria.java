package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;

import java.util.Locale;

public record ListedRoomQueryCriteria(
        String nameContains,
        RoomCategory category,
        JoinPolicy joinPolicy
) {

    public static final int MAX_NAME_QUERY_CODE_POINTS = 100;

    public ListedRoomQueryCriteria {
        nameContains = canonicalNameContains(nameContains);
    }

    public boolean unfiltered() {
        return nameContains == null
                && category == null
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
