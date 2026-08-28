package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.category.RoomCategory;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomCategorySummaryResponseTest {

    @Test
    void resolvesLatestNamesInRoomCategoryIdOrder() {
        Instant now = Instant.parse("2026-08-28T01:00:00Z");
        Map<String, RoomCategorySummaryResponse> indexed =
                RoomCategorySummaryResponse.index(List.of(
                        RoomCategory.create(
                                "category-2",
                                "환경",
                                now),
                        RoomCategory.create(
                                "category-1",
                                "정책",
                                now)));

        assertThat(RoomCategorySummaryResponse.resolve(
                List.of("category-1", "category-2"),
                indexed))
                .containsExactly(
                        new RoomCategorySummaryResponse(
                                "category-1",
                                "정책"),
                        new RoomCategorySummaryResponse(
                                "category-2",
                                "환경"));
    }

    @Test
    void rejectsAnOrphanRoomCategoryId() {
        assertThatThrownBy(() ->
                RoomCategorySummaryResponse.resolve(
                        List.of("missing-category"),
                        Map.of()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("missing-category");
    }
}
