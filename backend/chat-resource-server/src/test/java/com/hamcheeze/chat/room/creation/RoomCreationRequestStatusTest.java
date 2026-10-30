package com.hamcheeze.chat.room.creation;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RoomCreationRequestStatusTest {

    @Test
    void onlyPendingMayTransitionToTerminalStatus() {
        assertThat(RoomCreationRequestStatus.PENDING
                .canTransitionTo(RoomCreationRequestStatus.APPROVED))
                .isTrue();
        assertThat(RoomCreationRequestStatus.PENDING
                .canTransitionTo(RoomCreationRequestStatus.REJECTED))
                .isTrue();
        assertThat(RoomCreationRequestStatus.PENDING
                .canTransitionTo(RoomCreationRequestStatus.CANCELED))
                .isTrue();
        assertThat(RoomCreationRequestStatus.PENDING
                .canTransitionTo(RoomCreationRequestStatus.PENDING))
                .isFalse();
        assertThat(RoomCreationRequestStatus.APPROVED
                .canTransitionTo(RoomCreationRequestStatus.REJECTED))
                .isFalse();
        assertThat(RoomCreationRequestStatus.REJECTED
                .canTransitionTo(RoomCreationRequestStatus.CANCELED))
                .isFalse();
        assertThat(RoomCreationRequestStatus.CANCELED
                .canTransitionTo(RoomCreationRequestStatus.APPROVED))
                .isFalse();
    }

    @Test
    void onlyPendingIsNonTerminal() {
        assertThat(RoomCreationRequestStatus.PENDING.terminal())
                .isFalse();
        assertThat(RoomCreationRequestStatus.APPROVED.terminal())
                .isTrue();
        assertThat(RoomCreationRequestStatus.REJECTED.terminal())
                .isTrue();
        assertThat(RoomCreationRequestStatus.CANCELED.terminal())
                .isTrue();
    }
}
