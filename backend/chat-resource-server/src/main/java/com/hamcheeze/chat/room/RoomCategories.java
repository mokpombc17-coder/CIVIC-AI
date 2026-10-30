package com.hamcheeze.chat.room;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;

public final class RoomCategories {

    public static final int MIN_SELECTIONS = 1;
    public static final int MAX_SELECTIONS = 1;

    private RoomCategories() {
    }

    public static List<RoomCategory> requireValid(
            List<RoomCategory> categories
    ) {
        Objects.requireNonNull(categories, "categories");
        if (categories.size() < MIN_SELECTIONS
                || categories.size() > MAX_SELECTIONS) {
            throw new IllegalArgumentException(
                    "categories must contain between "
                            + MIN_SELECTIONS + " and "
                            + MAX_SELECTIONS + " values");
        }
        EnumSet<RoomCategory> unique =
                EnumSet.noneOf(RoomCategory.class);
        for (RoomCategory category : categories) {
            if (!unique.add(Objects.requireNonNull(
                    category,
                    "category"))) {
                throw new IllegalArgumentException(
                        "categories must not contain duplicates");
            }
        }
        return List.copyOf(new ArrayList<>(unique));
    }
}
