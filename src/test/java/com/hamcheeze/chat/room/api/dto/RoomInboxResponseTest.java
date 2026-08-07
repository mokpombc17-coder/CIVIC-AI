package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.inbox.model.RoomInboxView;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class RoomInboxResponseTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-04T08:30:00Z");

    @Test
    void mapsActiveDeletedAndMissingLastMessageShapes() {
        RoomInboxLastMessage active = new RoomInboxLastMessage(
                "message-1", 1, 2, MessageState.ACTIVE,
                "edited", true, CREATED_AT);
        RoomInboxLastMessage deleted = new RoomInboxLastMessage(
                "message-1", 1, 3,
                MessageState.DELETED_BY_AUTHOR,
                null, false, CREATED_AT);

        RoomInboxResponse activeResponse = RoomInboxResponse.from(
                view(active, CREATED_AT));
        RoomInboxResponse deletedResponse = RoomInboxResponse.from(
                view(deleted, CREATED_AT));
        Instant joinedAt = CREATED_AT.minusSeconds(10);
        RoomInboxResponse missingResponse = RoomInboxResponse.from(
                view(null, joinedAt));

        assertThat(activeResponse.lastMessage().state())
                .isEqualTo(MessageState.ACTIVE);
        assertThat(activeResponse.lastMessage().preview())
                .isEqualTo("edited");
        assertThat(activeResponse.lastMessage().messageVersion())
                .isEqualTo(2);
        assertThat(activeResponse.categories())
                .containsExactly(
                        com.hamcheeze.chat.room.RoomCategory.POLICY);
        assertThat(activeResponse.ownerMembershipId())
                .isEqualTo("membership-owner");
        assertThat(deletedResponse.lastMessage().state())
                .isEqualTo(MessageState.DELETED_BY_AUTHOR);
        assertThat(deletedResponse.lastMessage().preview()).isNull();
        assertThat(deletedResponse.lastMessage().previewTruncated())
                .isFalse();
        assertThat(missingResponse.lastMessage()).isNull();
        assertThat(missingResponse.lastActivityAt()).isEqualTo(joinedAt);
    }

    private static RoomInboxView view(
            RoomInboxLastMessage lastMessage,
            Instant lastActivityAt
    ) {
        return new RoomInboxView(
                "room-1",
                "Room",
                "description",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "membership-owner",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                2,
                CREATED_AT.minusSeconds(100),
                1,
                "membership-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                CREATED_AT.minusSeconds(10),
                1,
                0,
                0,
                false,
                lastMessage,
                lastActivityAt);
    }
}
