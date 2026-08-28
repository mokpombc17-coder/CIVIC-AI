package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import com.hamcheeze.chat.room.query.ListedRoomQueryCriteria;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ListedRoomQueryCriteriaResolverTest {

    private final ListedRoomQueryCriteriaResolver resolver =
            new ListedRoomQueryCriteriaResolver();

    @Test
    void resolvesCanonicalCriteria() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addParameter("query", "  POLICY  ");
        request.addParameter(
                "categoryId",
                RoomCategoryDefaults.LOCAL_ISSUE_CATEGORY_ID);
        request.addParameter("joinPolicy", "OPEN");

        ListedRoomQueryCriteria criteria = resolver.resolve(request);

        assertThat(criteria.nameContains()).isEqualTo("policy");
        assertThat(criteria.categoryId())
                .isEqualTo(
                        RoomCategoryDefaults.LOCAL_ISSUE_CATEGORY_ID);
        assertThat(criteria.joinPolicy()).isEqualTo(JoinPolicy.OPEN);
    }

    @Test
    void resolvesMissingOrBlankQueryAsUnfiltered() {
        assertThat(resolver.resolve(
                new MockHttpServletRequest()).unfiltered()).isTrue();

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addParameter("query", "   ");
        assertThat(resolver.resolve(request).unfiltered()).isTrue();

        MockHttpServletRequest unicodeWhitespace =
                new MockHttpServletRequest();
        unicodeWhitespace.addParameter("query", "\u2003");
        assertThat(resolver.resolve(unicodeWhitespace).unfiltered())
                .isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"query", "categoryId", "joinPolicy"})
    void rejectsRepeatedParameters(String parameterName) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addParameter(parameterName, "first", "second");

        assertInvalidRequest(() -> resolver.resolve(request));
    }

    @Test
    void rejectsBlankCategoryId() {
        MockHttpServletRequest blank = new MockHttpServletRequest();
        blank.addParameter("categoryId", "");
        assertInvalidRequest(() -> resolver.resolve(blank));
    }

    @Test
    void rejectsBlankOrUnsupportedJoinPolicy() {
        MockHttpServletRequest blank = new MockHttpServletRequest();
        blank.addParameter("joinPolicy", "");
        assertInvalidRequest(() -> resolver.resolve(blank));
        MockHttpServletRequest unsupported =
                new MockHttpServletRequest();
        unsupported.addParameter("joinPolicy", "unsupported");
        assertInvalidRequest(() -> resolver.resolve(unsupported));
    }

    @Test
    void rejectsLegacyCategoryParameter() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addParameter("category", "POLICY");

        assertInvalidRequest(() -> resolver.resolve(request));
    }

    @Test
    void mapsInvalidNameQueriesToInvalidRequest() {
        List<String> queries = List.of(
                "x".repeat(101),
                "\t",
                "\npolicy",
                "policy\r",
                "policy" + '\0' + "room");

        for (String query : queries) {
            MockHttpServletRequest request =
                    new MockHttpServletRequest();
            request.addParameter("query", query);

            assertInvalidRequest(() -> resolver.resolve(request));
        }
    }

    private void assertInvalidRequest(Runnable action) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(
                        RoomApiInputException.class,
                        exception -> {
                            assertThat(exception.code())
                                    .isEqualTo(
                                            RoomApiErrorCode.INVALID_REQUEST);
                            assertThat(exception.status())
                                    .isEqualTo(HttpStatus.BAD_REQUEST);
                        });
    }
}
