package com.hamcheeze.chat.room.category;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomCategoryIdsTest {

    @Test
    void acceptsOneToFiveDistinctIdsAndCanonicalizesSetOrder() {
        assertThat(RoomCategoryIds.requireValid(List.of("b", "a")))
                .containsExactly("a", "b");
        assertThat(RoomCategoryIds.requireValid(List.of(
                "e", "d", "c", "b", "a")))
                .containsExactly("a", "b", "c", "d", "e");
    }

    @Test
    void rejectsEmptyOversizedDuplicateAndBlankIds() {
        assertThatThrownBy(() ->
                RoomCategoryIds.requireValid(List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RoomCategoryIds.requireValid(List.of(
                "a", "b", "c", "d", "e", "f")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() ->
                RoomCategoryIds.requireValid(List.of("a", "a")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() ->
                RoomCategoryIds.requireValid(List.of(" ")))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
