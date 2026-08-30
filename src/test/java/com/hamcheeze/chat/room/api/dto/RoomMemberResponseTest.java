package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.query.model.RoomMemberView;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class RoomMemberResponseTest {

    private static final Instant JOINED_AT =
            Instant.parse("2026-08-29T01:00:00Z");

    @Test
    void usesProjectedUserLabelWithoutExposingOpaqueUserId() {
        RoomMemberResponse response = RoomMemberResponse.from(
                member(
                        "46fd4756-f07f-4b54-b03a-6e07740317da",
                        "junseok"));

        assertThat(response.userLabel()).isEqualTo("junseok");
    }

    @Test
    void keepsLocalFixtureLabel() {
        RoomMemberResponse response = RoomMemberResponse.from(
                member("local-user-1", "local-user-1"));

        assertThat(response.userLabel()).isEqualTo("local-user-1");
    }

    private static RoomMemberView member(
            String userId,
            String userLabel
    ) {
        return new RoomMemberView(
                "membership-1",
                userId,
                userLabel,
                "참여자 1",
                null,
                1,
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                JOINED_AT,
                null,
                null,
                1);
    }
}
