package com.hamcheeze.chat.room;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RoomDynamicCategoryIdsTest {

    @Test
    void restoresRoomWithOneToFiveOrderIndependentCategoryIds() {
        Room room = Room.restoreWithCategoryIds(
                "room-1",
                "동적 카테고리 방",
                "",
                List.of("category-c", "category-a", "category-b"),
                "membership-owner",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                2,
                Instant.parse("2026-08-28T00:00:00Z"),
                null,
                0);

        assertThat(room.categoryIds()).containsExactly(
                "category-a",
                "category-b",
                "category-c");
    }
}
