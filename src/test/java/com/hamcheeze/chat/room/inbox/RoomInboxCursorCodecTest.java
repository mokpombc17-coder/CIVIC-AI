package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.query.RoomQueryCursor;
import com.hamcheeze.chat.room.query.RoomQueryCursorCodec;
import com.hamcheeze.chat.room.query.RoomQueryErrorCode;
import com.hamcheeze.chat.room.query.RoomQueryException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomInboxCursorCodecTest {

    private final JsonMapper mapper = JsonMapper.builder().build();
    private final RoomInboxCursorCodec codec =
            new RoomInboxCursorCodec(mapper);

    @Test
    void roundTripsVersionTwoPayloadWithoutPadding() {
        RoomInboxCursor cursor = new RoomInboxCursor(
                2,
                RoomInboxCursor.Scope.MY_ROOM_INBOX,
                Instant.parse("2026-08-04T08:30:00.123Z"),
                "room-A");

        String encoded = codec.encode(cursor);

        assertThat(encoded).doesNotContain("=");
        assertThat(codec.decode(encoded)).isEqualTo(cursor);
    }

    @Test
    void rejectsSubMillisecondAndOutOfMongoDateRangeInstants() {
        Instant subMillisecond = Instant.parse(
                "2026-08-04T08:30:00.123000001Z");

        assertThatThrownBy(() -> cursor(subMillisecond))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("millisecond precision");
        assertThatThrownBy(() -> cursor(Instant.MAX))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("MongoDB Date range");

        assertInvalid(token("""
                {"version":2,"scope":"MY_ROOM_INBOX",
                "lastActivityAt":"2026-08-04T08:30:00.123000001Z",
                "lastRoomId":"room-A"}
                """));
        assertInvalid(token("""
                {"version":2,"scope":"MY_ROOM_INBOX",
                "lastActivityAt":"+1000000000-12-31T23:59:59.999999999Z",
                "lastRoomId":"room-A"}
                """));
    }

    @Test
    void rejectsVersionScopeMissingFieldsUnknownFieldsAndMalformedBase64() {
        assertInvalid("not-base64");
        assertInvalid(token("""
                {"version":1,"scope":"MY_ROOM_INBOX",
                "lastActivityAt":"2026-08-04T08:30:00Z",
                "lastRoomId":"room-A"}
                """));
        assertInvalid(token("""
                {"version":2,"scope":"OTHER",
                "lastActivityAt":"2026-08-04T08:30:00Z",
                "lastRoomId":"room-A"}
                """));
        assertInvalid(token("""
                {"version":2,"scope":"MY_ROOM_INBOX",
                "lastActivityAt":"2026-08-04T08:30:00Z"}
                """));
        assertInvalid(token("""
                {"version":2,"scope":"MY_ROOM_INBOX",
                "lastRoomId":"room-A"}
                """));
        assertInvalid(token("""
                {"version":2,"scope":"MY_ROOM_INBOX",
                "lastActivityAt":"2026-08-04T08:30:00Z",
                "lastRoomId":"room-A","extra":true}
                """));
    }

    @Test
    void rejectsLegacyAndCrossScopeRoomQueryCursors() {
        RoomQueryCursorCodec oldCodec = new RoomQueryCursorCodec(mapper);
        String legacyInbox = oldCodec.encode(new RoomQueryCursor(
                1,
                RoomQueryCursor.Scope.MY_ROOM_INBOX,
                com.hamcheeze.chat.room.MembershipStatus.ACTIVE,
                "membership-1"));
        String activeRooms = oldCodec.encode(new RoomQueryCursor(
                1,
                RoomQueryCursor.Scope.MY_ACTIVE_ROOMS,
                com.hamcheeze.chat.room.MembershipStatus.ACTIVE,
                "membership-1"));

        assertInvalid(legacyInbox);
        assertInvalid(activeRooms);
    }

    private void assertInvalid(String value) {
        assertThatThrownBy(() -> codec.decode(value))
                .isInstanceOf(RoomQueryException.class)
                .extracting("code")
                .isEqualTo(RoomQueryErrorCode.INVALID_CURSOR);
    }

    private static RoomInboxCursor cursor(Instant lastActivityAt) {
        return new RoomInboxCursor(
                2,
                RoomInboxCursor.Scope.MY_ROOM_INBOX,
                lastActivityAt,
                "room-A");
    }

    private static String token(String payload) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(payload.getBytes(
                        StandardCharsets.UTF_8));
    }
}
