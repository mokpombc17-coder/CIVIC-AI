package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import com.hamcheeze.chat.room.query.ListedRoomQueryCursor.Scope;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ListedRoomQueryCursorCodecTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-29T00:00:00Z");

    private final ListedRoomQueryCursorCodec codec =
            new ListedRoomQueryCursorCodec(
                    JsonMapper.builder().build());

    @Test
    void roundTripsCursorWithCanonicalCriteriaAndPosition() {
        ListedRoomQueryCriteria criteria =
                new ListedRoomQueryCriteria(
                        "Policy",
                        RoomCategoryDefaults.POLICY_CATEGORY_ID,
                        JoinPolicy.OPEN);
        ListedRoomQueryCursor cursor =
                new ListedRoomQueryCursor(
                        ListedRoomQueryCursor.CURRENT_VERSION,
                        Scope.LISTED_ROOMS,
                        criteria,
                        CREATED_AT,
                        "room-20");

        String token = codec.encode(cursor);

        assertThat(token).doesNotContain("room-20");
        assertThat(codec.decode(token, criteria)).isEqualTo(cursor);
    }

    @Test
    void rejectsMalformedVersionScopeCriteriaPositionAndRoomId() {
        ListedRoomQueryCriteria unfiltered = unfiltered();

        assertInvalid("not-base64", unfiltered);
        assertInvalid(token("""
                {"version":3,"scope":"LISTED_ROOMS",
                "criteria":{"query":null,"categoryId":null,
                "joinPolicy":null},"lastRoomId":"room-1"}
                """), unfiltered);
        assertInvalid(token("""
                {"version":3,"scope":"LISTED_ROOMS",
                "criteria":{"query":null,"categoryId":null,
                "joinPolicy":null},
                "lastCreatedAt":"2026-07-29T00:00:00Z",
                "lastRoomId":"room-1"}
                """), unfiltered);
        assertInvalid(token("""
                {"version":4,"scope":"UNKNOWN",
                "criteria":{"query":null,"categoryId":null,
                "joinPolicy":null},
                "lastCreatedAt":"2026-07-29T00:00:00Z",
                "lastRoomId":"room-1"}
                """), unfiltered);
        assertInvalid(token("""
                {"version":4,"scope":"LISTED_ROOMS",
                "criteria":null,
                "lastCreatedAt":"2026-07-29T00:00:00Z",
                "lastRoomId":"room-1"}
                """), unfiltered);
        assertInvalid(token("""
                {"version":4,"scope":"LISTED_ROOMS",
                "criteria":{"query":null,"categoryId":null,
                "joinPolicy":null},"lastRoomId":"room-1"}
                """), unfiltered);
        assertInvalid(token("""
                {"version":4,"scope":"LISTED_ROOMS",
                "criteria":{"query":null,"categoryId":null,
                "joinPolicy":null},
                "lastCreatedAt":"2026-07-29T00:00:00Z",
                "lastRoomId":"invalid room"}
                """), unfiltered);
    }

    @Test
    void rejectsUnknownCursorAndCriteriaFields() {
        assertInvalid(token("""
                {"version":4,"scope":"LISTED_ROOMS",
                "criteria":{"query":null,"categoryId":null,
                "joinPolicy":null},
                "lastCreatedAt":"2026-07-29T00:00:00Z",
                "lastRoomId":"room-1","unknown":true}
                """), unfiltered());
        assertInvalid(token("""
                {"version":4,"scope":"LISTED_ROOMS",
                "criteria":{"query":null,"categoryId":null,
                "joinPolicy":null,"unknown":true},
                "lastCreatedAt":"2026-07-29T00:00:00Z",
                "lastRoomId":"room-1"}
                """), unfiltered());
    }

    @Test
    void rejectsCursorIssuedForDifferentCriteria() {
        ListedRoomQueryCriteria issuedCriteria =
                new ListedRoomQueryCriteria(
                        "policy",
                        RoomCategoryDefaults.POLICY_CATEGORY_ID,
                        JoinPolicy.OPEN);
        String token = codec.encode(new ListedRoomQueryCursor(
                ListedRoomQueryCursor.CURRENT_VERSION,
                Scope.LISTED_ROOMS,
                issuedCriteria,
                CREATED_AT,
                "room-1"));

        assertInvalid(token, new ListedRoomQueryCriteria(
                "environment",
                RoomCategoryDefaults.POLICY_CATEGORY_ID,
                JoinPolicy.OPEN));
        assertInvalid(token, new ListedRoomQueryCriteria(
                "policy",
                RoomCategoryDefaults.ENVIRONMENT_CATEGORY_ID,
                JoinPolicy.OPEN));
        assertInvalid(token, new ListedRoomQueryCriteria(
                "policy",
                RoomCategoryDefaults.POLICY_CATEGORY_ID,
                JoinPolicy.INVITE_ONLY));
    }

    private ListedRoomQueryCriteria unfiltered() {
        return new ListedRoomQueryCriteria(null, null, null);
    }

    private void assertInvalid(
            String token,
            ListedRoomQueryCriteria criteria
    ) {
        assertThatThrownBy(() -> codec.decode(token, criteria))
                .isInstanceOf(RoomQueryException.class)
                .extracting("code")
                .isEqualTo(RoomQueryErrorCode.INVALID_CURSOR);
    }

    private String token(String payload) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(payload.getBytes(
                        StandardCharsets.UTF_8));
    }
}
