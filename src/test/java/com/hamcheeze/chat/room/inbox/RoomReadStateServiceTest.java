package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RoomReadStateServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-03T01:00:00Z");

    private RoomQueryReader roomReader;
    private RoomReadStateStore store;
    private RoomSequenceReader sequenceReader;
    private RoomReadStateService service;
    private Membership membership;

    @BeforeEach
    void setUp() {
        roomReader = mock(RoomQueryReader.class);
        store = mock(RoomReadStateStore.class);
        sequenceReader = mock(RoomSequenceReader.class);
        service = new RoomReadStateService(
                roomReader,
                store,
                sequenceReader,
                Clock.fixed(NOW, ZoneOffset.UTC),
                new SimpleMeterRegistry());
        membership = Membership.restore(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                NOW.minusSeconds(60),
                null,
                null,
                50,
                1);
        when(roomReader.findMembership("room-1", "user-1"))
                .thenReturn(Optional.of(membership));
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(activeRoom()));
        when(sequenceReader.currentSequence("room-1"))
                .thenReturn(60L);
    }

    @Test
    void missingStateUsesBoundaryAndStaleRequestIsNoop() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());

        ReadStateResult result = service.update(
                "user-1", "room-1", 49);

        assertThat(result.readThroughSequence()).isEqualTo(50);
        assertThat(result.updated()).isFalse();
        verify(store, never()).advance(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void advancesMonotonicallyAndReturnsEffectiveCursor() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());
        RoomReadState state = new RoomReadState(
                "membership-1", "room-1", "user-1", 55, NOW);
        when(store.advance(
                "membership-1", "room-1", "user-1", 55, NOW))
                .thenReturn(new RoomReadStateAdvance(state, true));

        ReadStateResult result = service.update(
                "user-1", "room-1", 55);

        assertThat(result.readThroughSequence()).isEqualTo(55);
        assertThat(result.updated()).isTrue();
    }

    @Test
    void rejectsSequenceAheadOfRoom() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.update(
                "user-1", "room-1", 61))
                .isInstanceOfSatisfying(
                        RoomInboxException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(RoomInboxErrorCode
                                        .READ_SEQUENCE_AHEAD));
    }

    private Room activeRoom() {
        return Room.restore(
                "room-1",
                "Room",
                "",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                NOW.minusSeconds(120),
                null,
                1);
    }
}
