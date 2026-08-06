package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ListedRoomQueryCriteriaTest {

    @Test
    void canonicalizesNameQueryAndRetainsStructuredFilters() {
        ListedRoomQueryCriteria criteria =
                new ListedRoomQueryCriteria(
                        "\u2003PoLiCy\u2003",
                        RoomCategory.POLICY,
                        JoinPolicy.OPEN);

        assertThat(criteria.nameContains()).isEqualTo("policy");
        assertThat(criteria.category())
                .isEqualTo(RoomCategory.POLICY);
        assertThat(criteria.joinPolicy())
                .isEqualTo(JoinPolicy.OPEN);
        assertThat(criteria.unfiltered()).isFalse();
    }

    @Test
    void missingOrBlankNameQueryDoesNotApplyTextSearch() {
        assertThat(new ListedRoomQueryCriteria(
                null,
                null,
                null).unfiltered()).isTrue();
        assertThat(new ListedRoomQueryCriteria(
                "  \t ",
                null,
                null).nameContains()).isNull();
    }

    @Test
    void acceptsUpToOneHundredUnicodeCodePoints() {
        String query = "😀".repeat(100);

        ListedRoomQueryCriteria criteria =
                new ListedRoomQueryCriteria(
                        query,
                        null,
                        null);

        assertThat(criteria.nameContains()).isEqualTo(query);
    }

    @Test
    void rejectsMoreThanOneHundredUnicodeCodePoints() {
        assertThatThrownBy(() -> new ListedRoomQueryCriteria(
                "😀".repeat(101),
                null,
                null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsControlCharacters() {
        assertThatThrownBy(() -> new ListedRoomQueryCriteria(
                "policy\nroom",
                null,
                null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
