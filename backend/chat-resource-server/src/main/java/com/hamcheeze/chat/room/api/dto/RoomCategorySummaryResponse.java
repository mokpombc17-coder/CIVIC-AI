package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.category.RoomCategory;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record RoomCategorySummaryResponse(
        String categoryId,
        String name
) {

    public static Map<String, RoomCategorySummaryResponse> index(
            List<RoomCategory> categories
    ) {
        Map<String, RoomCategorySummaryResponse> indexed =
                new LinkedHashMap<>();
        for (RoomCategory category : categories) {
            indexed.put(
                    category.categoryId(),
                    new RoomCategorySummaryResponse(
                            category.categoryId(),
                            category.name()));
        }
        return Map.copyOf(indexed);
    }

    public static List<RoomCategorySummaryResponse> resolve(
            List<String> categoryIds,
            Map<String, RoomCategorySummaryResponse> indexed
    ) {
        return categoryIds.stream()
                .map(categoryId -> requireSummary(
                        categoryId,
                        indexed))
                .toList();
    }

    private static RoomCategorySummaryResponse requireSummary(
            String categoryId,
            Map<String, RoomCategorySummaryResponse> indexed
    ) {
        RoomCategorySummaryResponse summary = indexed.get(categoryId);
        if (summary == null) {
            throw new IllegalStateException(
                    "Room category catalog is missing categoryId: "
                            + categoryId);
        }
        return summary;
    }
}
