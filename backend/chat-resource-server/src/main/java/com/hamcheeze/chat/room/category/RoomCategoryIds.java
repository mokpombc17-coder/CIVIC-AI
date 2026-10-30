package com.hamcheeze.chat.room.category;

import java.util.List;
import java.util.Objects;
import java.util.TreeSet;

public final class RoomCategoryIds {

    public static final int MIN_SELECTIONS = 1;
    public static final int MAX_SELECTIONS = 5;

    private RoomCategoryIds() {
    }

    public static List<String> requireValid(List<String> categoryIds) {
        Objects.requireNonNull(categoryIds, "categoryIds");
        if (categoryIds.size() < MIN_SELECTIONS
                || categoryIds.size() > MAX_SELECTIONS) {
            throw new IllegalArgumentException(
                    "categoryIds must contain between "
                            + MIN_SELECTIONS
                            + " and "
                            + MAX_SELECTIONS
                            + " values");
        }
        TreeSet<String> unique = new TreeSet<>();
        for (String categoryId : categoryIds) {
            String id = Objects.requireNonNull(
                    categoryId,
                    "categoryId");
            if (id.isBlank()) {
                throw new IllegalArgumentException(
                        "categoryId must not be blank");
            }
            if (!unique.add(id)) {
                throw new IllegalArgumentException(
                        "categoryIds must not contain duplicates");
            }
        }
        return List.copyOf(unique);
    }
}
