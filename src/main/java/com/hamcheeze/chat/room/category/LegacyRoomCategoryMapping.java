package com.hamcheeze.chat.room.category;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class LegacyRoomCategoryMapping {

    private LegacyRoomCategoryMapping() {
    }

    public static List<String> categoryIds(
            List<com.hamcheeze.chat.room.RoomCategory> categories
    ) {
        Objects.requireNonNull(categories, "categories");
        return RoomCategoryIds.requireValid(categories.stream()
                .map(LegacyRoomCategoryMapping::categoryId)
                .toList());
    }

    public static List<com.hamcheeze.chat.room.RoomCategory>
    legacyCategories(List<String> categoryIds) {
        return RoomCategoryIds.requireValid(categoryIds).stream()
                .map(LegacyRoomCategoryMapping::legacyCategory)
                .toList();
    }

    public static String categoryId(
            com.hamcheeze.chat.room.RoomCategory category
    ) {
        Objects.requireNonNull(category, "category");
        return switch (category) {
            case POLICY -> RoomCategoryDefaults.POLICY_CATEGORY_ID;
            case ENVIRONMENT ->
                    RoomCategoryDefaults.ENVIRONMENT_CATEGORY_ID;
            case LOCAL_ISSUE ->
                    RoomCategoryDefaults.LOCAL_ISSUE_CATEGORY_ID;
        };
    }

    public static String categoryId(String legacyName) {
        try {
            return categoryId(com.hamcheeze.chat.room.RoomCategory
                    .valueOf(Objects.requireNonNull(
                            legacyName,
                            "legacyName")));
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException(
                    "Unsupported legacy Room category: "
                            + legacyName,
                    exception);
        }
    }

    public static RoomCategory category(
            String legacyName,
            Instant createdAt
    ) {
        com.hamcheeze.chat.room.RoomCategory legacy;
        try {
            legacy = com.hamcheeze.chat.room.RoomCategory.valueOf(
                    Objects.requireNonNull(legacyName, "legacyName"));
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException(
                    "Unsupported legacy Room category: "
                            + legacyName,
                    exception);
        }
        String name = switch (legacy) {
            case POLICY -> RoomCategoryDefaults.POLICY_CATEGORY_NAME;
            case ENVIRONMENT ->
                    RoomCategoryDefaults.ENVIRONMENT_CATEGORY_NAME;
            case LOCAL_ISSUE ->
                    RoomCategoryDefaults.LOCAL_ISSUE_CATEGORY_NAME;
        };
        return RoomCategory.create(
                categoryId(legacy),
                name,
                createdAt);
    }

    private static com.hamcheeze.chat.room.RoomCategory legacyCategory(
            String categoryId
    ) {
        if (RoomCategoryDefaults.POLICY_CATEGORY_ID.equals(categoryId)) {
            return com.hamcheeze.chat.room.RoomCategory.POLICY;
        }
        if (RoomCategoryDefaults.ENVIRONMENT_CATEGORY_ID.equals(
                categoryId)) {
            return com.hamcheeze.chat.room.RoomCategory.ENVIRONMENT;
        }
        if (RoomCategoryDefaults.LOCAL_ISSUE_CATEGORY_ID.equals(
                categoryId)) {
            return com.hamcheeze.chat.room.RoomCategory.LOCAL_ISSUE;
        }
        throw new IllegalStateException(
                "The dynamic Room category cannot be represented by "
                        + "the legacy API: "
                        + categoryId);
    }
}
