package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.query.ListedRoomQueryCriteria;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ListedRoomQueryCriteriaResolverTest {

    private final ListedRoomQueryCriteriaResolver resolver =
            new ListedRoomQueryCriteriaResolver();

    @Test
    void resolvesCanonicalCriteria() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addParameter("query", "  POLICY  ");
        request.addParameter("category", "LOCAL_ISSUE");
        request.addParameter("joinPolicy", "OPEN");

        ListedRoomQueryCriteria criteria = resolver.resolve(request);

        assertThat(criteria.nameContains()).isEqualTo("policy");
        assertThat(criteria.category())
                .isEqualTo(RoomCategory.LOCAL_ISSUE);
        assertThat(criteria.joinPolicy()).isEqualTo(JoinPolicy.OPEN);
    }

    @Test
    void resolvesMissingOrBlankQueryAsUnfiltered() {
        assertThat(resolver.resolve(
                new MockHttpServletRequest()).unfiltered()).isTrue();

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addParameter("query", "   ");
        assertThat(resolver.resolve(request).unfiltered()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"query", "category", "joinPolicy"})
    void rejectsRepeatedParameters(String parameterName) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addParameter(parameterName, "first", "second");

        assertInvalidRequest(() -> resolver.resolve(request));
    }

    @ParameterizedTest
    @ValueSource(strings = {"category", "joinPolicy"})
    void rejectsBlankOrUnsupportedEnumValues(String parameterName) {
        MockHttpServletRequest blank = new MockHttpServletRequest();
        blank.addParameter(parameterName, "");
        assertInvalidRequest(() -> resolver.resolve(blank));

        MockHttpServletRequest unsupported =
                new MockHttpServletRequest();
        unsupported.addParameter(parameterName, "unsupported");
        assertInvalidRequest(() -> resolver.resolve(unsupported));
    }

    @Test
    void mapsInvalidNameQueryToInvalidRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addParameter("query", "x".repeat(101));

        assertInvalidRequest(() -> resolver.resolve(request));
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
