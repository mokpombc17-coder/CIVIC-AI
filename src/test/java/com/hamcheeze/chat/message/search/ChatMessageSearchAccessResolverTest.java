package com.hamcheeze.chat.message.search;

import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.room.authorization.RoomAccessSnapshot;
import com.hamcheeze.chat.room.authorization.RoomAccessState;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatMessageSearchAccessResolverTest {

    private final RoomAccessReader reader = mock(RoomAccessReader.class);
    private final ChatMessageSearchAccessResolver resolver =
            new ChatMessageSearchAccessResolver(reader);

    @Test
    void activeMembershipReturnsCompleteSearchContext() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(active("room-1", 0, 100));

        ChatMessageSearchAccess access = resolver.resolve(
                "user-1",
                "room-1");

        assertThat(access.state())
                .isEqualTo(ChatMessageSearchAccessState.ALLOWED);
        assertThat(access.membershipId()).isEqualTo("membership-1");
        assertThat(access.membershipVersion()).isZero();
        assertThat(access.messageVisibleAfterSequence()).isEqualTo(100);
    }

    @Test
    void closedRoomIsDistinctFromMembershipAccessDenial() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(new RoomAccessSnapshot(
                        "room-1",
                        RoomStatus.CLOSED,
                        3,
                        null,
                        null,
                        null,
                        null,
                        RoomAccessState.ROOM_CLOSED));

        assertThat(resolver.resolve("user-1", "room-1").state())
                .isEqualTo(
                        ChatMessageSearchAccessState.ROOM_NOT_AVAILABLE);
    }

    @Test
    void missingInactiveAndBannedMembershipsAreAccessDenied() {
        assertAccessDenied(RoomAccessState.ROOM_NOT_FOUND, null);
        assertAccessDenied(RoomAccessState.MEMBERSHIP_NOT_FOUND, null);
        assertAccessDenied(
                RoomAccessState.MEMBERSHIP_LEFT,
                MembershipStatus.LEFT);
        assertAccessDenied(
                RoomAccessState.MEMBERSHIP_BANNED,
                MembershipStatus.BANNED);
    }

    @Test
    void malformedMismatchedAndFailedSnapshotsAreUnavailable() {
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(active("room-2", 0, 0));
        assertThat(resolver.resolve("user-1", "room-1").state())
                .isEqualTo(ChatMessageSearchAccessState.UNAVAILABLE);

        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(new RoomAccessSnapshot(
                        "room-1",
                        RoomStatus.ACTIVE,
                        1,
                        "membership-1",
                        MembershipStatus.ACTIVE,
                        null,
                        0L,
                        RoomAccessState.ACTIVE_MEMBER));
        assertThat(resolver.resolve("user-1", "room-1").state())
                .isEqualTo(ChatMessageSearchAccessState.UNAVAILABLE);

        when(reader.readAccess("user-1", "room-1"))
                .thenThrow(new IllegalStateException("mongo down"));
        assertThat(resolver.resolve("user-1", "room-1").state())
                .isEqualTo(ChatMessageSearchAccessState.UNAVAILABLE);
    }

    @Test
    void invalidInputsAreDeniedWithoutReadingStorage() {
        assertThat(resolver.resolve("", "room-1").state())
                .isEqualTo(ChatMessageSearchAccessState.ACCESS_DENIED);
        assertThat(resolver.resolve("user-1", "invalid room").state())
                .isEqualTo(ChatMessageSearchAccessState.ACCESS_DENIED);
    }

    private void assertAccessDenied(
            RoomAccessState state,
            MembershipStatus membershipStatus
    ) {
        RoomAccessSnapshot snapshot;
        if (state == RoomAccessState.ROOM_NOT_FOUND) {
            snapshot = RoomAccessSnapshot.roomNotFound("room-1");
        } else if (state == RoomAccessState.MEMBERSHIP_NOT_FOUND) {
            snapshot = new RoomAccessSnapshot(
                    "room-1", RoomStatus.ACTIVE, 1,
                    null, null, null, null, state);
        } else {
            snapshot = new RoomAccessSnapshot(
                    "room-1", RoomStatus.ACTIVE, 1,
                    "membership-1", membershipStatus,
                    1L, 0L, state);
        }
        when(reader.readAccess("user-1", "room-1"))
                .thenReturn(snapshot);

        assertThat(resolver.resolve("user-1", "room-1").state())
                .isEqualTo(ChatMessageSearchAccessState.ACCESS_DENIED);
    }

    private RoomAccessSnapshot active(
            String roomId,
            long membershipVersion,
            long boundary
    ) {
        return new RoomAccessSnapshot(
                roomId,
                RoomStatus.ACTIVE,
                1,
                "membership-1",
                MembershipStatus.ACTIVE,
                membershipVersion,
                boundary,
                RoomAccessState.ACTIVE_MEMBER);
    }
}
