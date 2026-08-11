package com.hamcheeze.chat.message.search;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatMessageSearchCursorBindingTest {

    private static final String FINGERPRINT = "a".repeat(64);

    @Test
    void preservesOpaqueNonBlankMembershipIds() {
        String unicodeMembershipId = "멤버십-가";
        String longMembershipId = "membership-" + "x".repeat(100);

        assertThat(binding(unicodeMembershipId).requesterMembershipId())
                .isEqualTo(unicodeMembershipId);
        assertThat(binding(longMembershipId).requesterMembershipId())
                .isEqualTo(longMembershipId);
        assertThat(binding(" membership ").requesterMembershipId())
                .isEqualTo(" membership ");
    }

    @Test
    void rejectsNullAndBlankMembershipIds() {
        assertThatThrownBy(() -> binding(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not be blank");
        assertThatThrownBy(() -> binding(" \u2003 "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not be blank");
    }

    @Test
    void keepsRoomIdAsciiAndLengthContract() {
        assertThatThrownBy(() -> bindingWithRoom("방-1"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("roomId");
        assertThatThrownBy(() -> bindingWithRoom("r".repeat(65)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("roomId");
        assertThatThrownBy(() -> bindingWithRoom("room.1"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("roomId");
    }

    private ChatMessageSearchCursorBinding binding(
            String membershipId
    ) {
        return new ChatMessageSearchCursorBinding(
                "room-1",
                membershipId,
                3,
                10,
                FINGERPRINT,
                20);
    }

    private ChatMessageSearchCursorBinding bindingWithRoom(
            String roomId
    ) {
        return new ChatMessageSearchCursorBinding(
                roomId,
                "membership-1",
                3,
                10,
                FINGERPRINT,
                20);
    }
}
