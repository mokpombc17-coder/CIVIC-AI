package com.hamcheeze.chat.room.receipt;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.inbox.RoomInboxErrorCode;
import com.hamcheeze.chat.room.inbox.RoomInboxException;
import com.hamcheeze.chat.room.inbox.RoomReadPositionResolver;
import com.hamcheeze.chat.room.inbox.RoomReadState;
import com.hamcheeze.chat.room.inbox.RoomReadStateStore;
import com.hamcheeze.chat.room.inbox.RoomSequenceReader;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RoomReadReceiptStateServiceTest {

    private static final Instant NOW = Instant.parse(
            "2026-08-10T03:00:00Z");

    private RoomQueryReader roomReader;
    private RoomReadStateStore stateStore;
    private RoomSequenceReader sequenceReader;
    private RoomReadReceiptProperties properties;
    private RoomReadReceiptStateService service;
    private Membership self;
    private Membership other;

    @BeforeEach
    void setUp() {
        roomReader = mock(RoomQueryReader.class);
        stateStore = mock(RoomReadStateStore.class);
        sequenceReader = mock(RoomSequenceReader.class);
        properties = new RoomReadReceiptProperties();
        service = new RoomReadReceiptStateService(
                roomReader,
                stateStore,
                new RoomReadPositionResolver(),
                sequenceReader,
                properties,
                Clock.fixed(NOW, ZoneOffset.UTC),
                new SimpleMeterRegistry());
        self = membership(
                "membership-b", "user-self", 0, 3);
        other = membership(
                "membership-a", "user-other", 100, 2);
        stubStable(room(2, 12), List.of(self, other));
        when(sequenceReader.currentSequence("room-1"))
                .thenReturn(130L);
    }

    @Test
    void returnsActiveSelfAndPositionsSortedByMembershipId() {
        when(stateStore.findByMembershipIds(any()))
                .thenReturn(Map.of(
                        self.membershipId(), state(self, 130),
                        other.membershipId(), state(other, 118)));

        RoomReadReceiptState result = service.state(
                "user-self", "room-1");

        assertThat(result.roomId()).isEqualTo("room-1");
        assertThat(result.roomVersion()).isEqualTo(12);
        assertThat(result.selfMembershipId())
                .isEqualTo(self.membershipId());
        assertThat(result.generatedAt()).isEqualTo(NOW);
        assertThat(result.positions())
                .extracting(RoomReadReceiptPosition::membershipId)
                .containsExactly("membership-a", "membership-b");
        assertThat(result.positions().getFirst())
                .isEqualTo(new RoomReadReceiptPosition(
                        "membership-a", 2, 100, 118));
    }

    @Test
    void missingReadStateUsesZeroWithoutPromotingVisibilityBoundary() {
        when(stateStore.findByMembershipIds(any()))
                .thenReturn(Map.of(
                        self.membershipId(), state(self, 90)));

        RoomReadReceiptState result = service.state(
                "user-self", "room-1");

        RoomReadReceiptPosition position = result.positions().stream()
                .filter(value -> value.membershipId().equals(
                        other.membershipId()))
                .findFirst()
                .orElseThrow();
        assertThat(position.messageVisibleAfterSequence())
                .isEqualTo(100);
        assertThat(position.storedLastReadSequence()).isZero();
    }

    @Test
    void retriesWhenRoomVersionChangesThenReturnsStableState() {
        Room first = room(2, 12);
        Room changed = room(2, 13);
        when(roomReader.findRoomById("room-1"))
                .thenReturn(
                        Optional.of(first),
                        Optional.of(changed),
                        Optional.of(changed),
                        Optional.of(changed));
        when(stateStore.findByMembershipIds(any()))
                .thenReturn(Map.of());

        RoomReadReceiptState result = service.state(
                "user-self", "room-1");

        assertThat(result.roomVersion()).isEqualTo(13);
    }

    @Test
    void retryExhaustionIsRetryableUnavailable() {
        properties.setSnapshotMaxConsistencyAttempts(2);
        when(roomReader.findRoomById("room-1"))
                .thenReturn(
                        Optional.of(room(2, 10)),
                        Optional.of(room(2, 11)),
                        Optional.of(room(2, 12)),
                        Optional.of(room(2, 13)));
        when(stateStore.findByMembershipIds(any()))
                .thenReturn(Map.of());

        assertThatThrownBy(() -> service.state(
                "user-self", "room-1"))
                .isInstanceOfSatisfying(
                        RoomInboxException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(RoomInboxErrorCode
                                        .ROOM_INBOX_UNAVAILABLE));
    }

    @Test
    void requesterWithoutActiveMembershipIsDenied() {
        when(roomReader.findMembership("room-1", "user-self"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.state(
                "user-self", "room-1"))
                .isInstanceOfSatisfying(
                        RoomInboxException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(
                                        RoomInboxErrorCode.ACCESS_DENIED));
    }

    @Test
    void closedRoomIsUnavailable() {
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(closedRoom()));

        assertThatThrownBy(() -> service.state(
                "user-self", "room-1"))
                .isInstanceOfSatisfying(
                        RoomInboxException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(RoomInboxErrorCode
                                        .READ_STATE_NOT_AVAILABLE));
    }

    @Test
    void mismatchedReadStateIdentityFailsClosed() {
        when(stateStore.findByMembershipIds(any()))
                .thenReturn(Map.of(
                        other.membershipId(),
                        new RoomReadState(
                                other.membershipId(),
                                "room-1",
                                "wrong-user",
                                118,
                                NOW)));

        assertThatThrownBy(() -> service.state(
                "user-self", "room-1"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("identity");
    }

    @Test
    void cursorOrBoundaryAheadOfRoomIsInconsistent() {
        when(stateStore.findByMembershipIds(any()))
                .thenReturn(Map.of(
                        self.membershipId(), state(self, 131)));

        assertThatThrownBy(() -> service.state(
                "user-self", "room-1"))
                .isInstanceOfSatisfying(
                        RoomInboxException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(RoomInboxErrorCode
                                        .READ_STATE_INCONSISTENT));
    }

    @Test
    void partialParticipantSnapshotIsNeverReturned() {
        when(roomReader.findMembershipsByRoomAndStatus(
                eq("room-1"),
                eq(MembershipStatus.ACTIVE),
                isNull(),
                anyInt()))
                .thenReturn(new CursorSlice<>(
                        List.of(self, other), true));

        assertThatThrownBy(() -> service.state(
                "user-self", "room-1"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("safety limit");
    }

    private void stubStable(Room room, List<Membership> memberships) {
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room));
        when(roomReader.findMembership("room-1", "user-self"))
                .thenReturn(Optional.of(self));
        when(roomReader.findMembershipsByRoomAndStatus(
                eq("room-1"),
                eq(MembershipStatus.ACTIVE),
                isNull(),
                anyInt()))
                .thenReturn(new CursorSlice<>(memberships, false));
    }

    private static Room room(int activeMemberCount, long version) {
        return Room.restore(
                "room-1",
                "Room",
                "Description",
                List.of(RoomCategory.POLICY),
                "membership-b",
                "user-self",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                activeMemberCount,
                NOW.minusSeconds(60),
                null,
                version);
    }

    private static Room closedRoom() {
        return Room.restore(
                "room-1",
                "Room",
                "Description",
                List.of(RoomCategory.POLICY),
                "membership-b",
                "user-self",
                RoomStatus.CLOSED,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                0,
                NOW.minusSeconds(120),
                NOW.minusSeconds(60),
                13);
    }

    private static Membership membership(
            String membershipId,
            String userId,
            long boundary,
            long version
    ) {
        return Membership.restore(
                membershipId,
                "room-1",
                userId,
                membershipId.equals("membership-b")
                        ? MembershipRole.OWNER
                        : MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                NOW.minusSeconds(60),
                null,
                null,
                boundary,
                version);
    }

    private static RoomReadState state(
            Membership membership,
            long cursor
    ) {
        return new RoomReadState(
                membership.membershipId(),
                membership.roomId(),
                membership.userId(),
                cursor,
                NOW);
    }
}
