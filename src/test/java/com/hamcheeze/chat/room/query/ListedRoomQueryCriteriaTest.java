package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import org.junit.jupiter.api.Test;

import java.util.List;

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
                "   ",
                null,
                null).nameContains()).isNull();
        assertThat(new ListedRoomQueryCriteria(
                "\u2003",
                null,
                null).nameContains()).isNull();
    }

    @Test
    void acceptsOneCodePointNameQuery() {
        assertThat(new ListedRoomQueryCriteria(
                "법",
                null,
                null).nameContains()).isEqualTo("법");
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
    void rejectsRawControlCharactersBeforeStripping() {
        List<String> queries = List.of(
                "\t",
                "\npolicy",
                "policy\r",
                "policy" + '\0' + "room");

        for (String query : queries) {
            assertThatThrownBy(() ->
                    new ListedRoomQueryCriteria(
                            query,
                            null,
                            null))
                    .as("query code points: %s",
                            query.codePoints().boxed().toList())
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("control characters");
        }
    }
}
