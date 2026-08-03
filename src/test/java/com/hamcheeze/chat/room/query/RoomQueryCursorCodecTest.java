package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.query.RoomQueryCursor.Scope;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomQueryCursorCodecTest {

    private final RoomQueryCursorCodec codec =
            new RoomQueryCursorCodec(
                    JsonMapper.builder().build());

    @Test
    void roundTripsOpaqueCursor() {
        RoomQueryCursor cursor = new RoomQueryCursor(
                1,
                Scope.ROOM_MEMBERSHIPS,
                MembershipStatus.BANNED,
                "membership-20");

        String token = codec.encode(cursor);

        assertThat(token).doesNotContain("membership-20");
        assertThat(codec.decode(
                token,
                Scope.ROOM_MEMBERSHIPS,
                MembershipStatus.BANNED))
                .isEqualTo(cursor);
    }

    @Test
    void rejectsMalformedVersionScopeStatusAndMissingId() {
        assertInvalid("not-base64");
        assertInvalid(token("""
                {"version":2,"scope":"ROOM_MEMBERSHIPS",
                "status":"ACTIVE","lastMembershipId":"m-1"}
                """));
        assertThatThrownBy(() -> codec.decode(
                codec.encode(new RoomQueryCursor(
                        1,
                        Scope.MY_ACTIVE_ROOMS,
                        MembershipStatus.ACTIVE,
                        "m-1")),
                Scope.ROOM_MEMBERSHIPS,
                MembershipStatus.ACTIVE))
                .isInstanceOf(RoomQueryException.class)
                .extracting("code")
                .isEqualTo(RoomQueryErrorCode.INVALID_CURSOR);
        assertThatThrownBy(() -> codec.decode(
                codec.encode(new RoomQueryCursor(
                        1,
                        Scope.ROOM_MEMBERSHIPS,
                        MembershipStatus.ACTIVE,
                        "m-1")),
                Scope.ROOM_MEMBERSHIPS,
                MembershipStatus.BANNED))
                .isInstanceOf(RoomQueryException.class)
                .extracting("code")
                .isEqualTo(RoomQueryErrorCode.INVALID_CURSOR);
        assertInvalid(token("""
                {"version":1,"scope":"ROOM_MEMBERSHIPS",
                "status":"ACTIVE","lastMembershipId":null}
                """));
    }

    @Test
    void roomInboxAndActiveRoomCursorsAreNotInterchangeable() {
        String inbox = codec.encode(new RoomQueryCursor(
                1,
                Scope.MY_ROOM_INBOX,
                MembershipStatus.ACTIVE,
                "m-1"));
        String activeRooms = codec.encode(new RoomQueryCursor(
                1,
                Scope.MY_ACTIVE_ROOMS,
                MembershipStatus.ACTIVE,
                "m-1"));

        assertThatThrownBy(() -> codec.decode(
                inbox,
                Scope.MY_ACTIVE_ROOMS,
                MembershipStatus.ACTIVE))
                .isInstanceOf(RoomQueryException.class);
        assertThatThrownBy(() -> codec.decode(
                activeRooms,
                Scope.MY_ROOM_INBOX,
                MembershipStatus.ACTIVE))
                .isInstanceOf(RoomQueryException.class);
    }

    private void assertInvalid(String token) {
        assertThatThrownBy(() -> codec.decode(
                token,
                Scope.ROOM_MEMBERSHIPS,
                MembershipStatus.ACTIVE))
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
