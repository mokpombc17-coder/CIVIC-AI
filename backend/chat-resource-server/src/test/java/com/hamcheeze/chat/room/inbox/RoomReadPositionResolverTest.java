package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomReadPositionResolverTest {

    private static final Instant NOW =
            Instant.parse("2026-08-07T01:00:00Z");

    private final RoomReadPositionResolver resolver =
            new RoomReadPositionResolver();

    @Test
    void missingStateUsesZeroStoredCursorAndVisibilityBoundary() {
        RoomReadPosition position = resolver.resolve(
                membership(50), null);

        assertThat(position.messageVisibleAfterSequence()).isEqualTo(50);
        assertThat(position.storedLastReadSequence()).isZero();
        assertThat(position.effectiveReadThroughSequence()).isEqualTo(50);
    }

    @Test
    void visibilityBoundaryWinsWhenStoredCursorIsLower() {
        RoomReadPosition position = resolver.resolve(
                membership(50), state(
                        "membership-1", "room-1", "user-1", 40));

        assertThat(position.storedLastReadSequence()).isEqualTo(40);
        assertThat(position.effectiveReadThroughSequence()).isEqualTo(50);
    }

    @Test
    void storedCursorWinsWhenItIsHigherThanVisibilityBoundary() {
        RoomReadPosition position = resolver.resolve(
                membership(50), state(
                        "membership-1", "room-1", "user-1", 60));

        assertThat(position.storedLastReadSequence()).isEqualTo(60);
        assertThat(position.effectiveReadThroughSequence()).isEqualTo(60);
    }

    @Test
    void rejectsMembershipIdMismatch() {
        assertIdentityMismatch(state(
                "membership-2", "room-1", "user-1", 50));
    }

    @Test
    void rejectsRoomIdMismatch() {
        assertIdentityMismatch(state(
                "membership-1", "room-2", "user-1", 50));
    }

    @Test
    void rejectsUserIdMismatch() {
        assertIdentityMismatch(state(
                "membership-1", "room-1", "user-2", 50));
    }

    @Test
    void rejectsMissingMembership() {
        assertThatNullPointerException()
                .isThrownBy(() -> resolver.resolve(null, null))
                .withMessage("membership");
    }

    @Test
    void readPositionRejectsInvalidSequenceInvariants() {
        assertThatThrownBy(() -> new RoomReadPosition(-1, 0, 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RoomReadPosition(0, -1, 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RoomReadPosition(10, 20, 10))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private void assertIdentityMismatch(RoomReadState state) {
        assertThatThrownBy(() -> resolver.resolve(
                membership(50), state))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage(
                        "Room read state identity does not match membership");
    }

    private static Membership membership(long visibilityBoundary) {
        return Membership.restore(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                com.hamcheeze.chat.room.MembershipProfile.createAnonymous(
                        2,
                        java.time.Instant.EPOCH),
                NOW.minusSeconds(60),
                null,
                null,
                visibilityBoundary,
                1);
    }

    private static RoomReadState state(
            String membershipId,
            String roomId,
            String userId,
            long storedCursor
    ) {
        return new RoomReadState(
                membershipId,
                roomId,
                userId,
                storedCursor,
                NOW);
    }
}
