package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import com.hamcheeze.chat.room.receipt.RoomReadPositionAdvanceObserver;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DuplicateKeyException;

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
import static org.mockito.Mockito.doThrow;

class RoomReadStateServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-03T01:00:00Z");

    private RoomQueryReader roomReader;
    private RoomReadStateStore store;
    private RoomSequenceReader sequenceReader;
    private RoomReadPositionAdvanceObserver advanceObserver;
    private RoomReadStateService service;
    private Membership membership;

    @BeforeEach
    void setUp() {
        roomReader = mock(RoomQueryReader.class);
        store = mock(RoomReadStateStore.class);
        sequenceReader = mock(RoomSequenceReader.class);
        advanceObserver = mock(
                RoomReadPositionAdvanceObserver.class);
        service = new RoomReadStateService(
                roomReader,
                store,
                new RoomReadPositionResolver(),
                sequenceReader,
                advanceObserver,
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
    void requestAtEffectiveCursorIsNoop() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());

        ReadStateResult result = service.update(
                "user-1", "room-1", 50);

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
        verify(advanceObserver).onAdvanced(
                "room-1", "membership-1", 1, 55);
    }

    @Test
    void observerUsesStoreCursorAndOnlyRunsForActualWrite() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());
        RoomReadState state = new RoomReadState(
                "membership-1", "room-1", "user-1", 60, NOW);
        when(store.advance(
                "membership-1", "room-1", "user-1", 55, NOW))
                .thenReturn(new RoomReadStateAdvance(state, true));

        service.update("user-1", "room-1", 55);

        verify(advanceObserver).onAdvanced(
                "room-1", "membership-1", 1, 60);
    }

    @Test
    void observerIsNotCalledForStoreOrServiceNoop() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());
        RoomReadState state = new RoomReadState(
                "membership-1", "room-1", "user-1", 60, NOW);
        when(store.advance(
                "membership-1", "room-1", "user-1", 55, NOW))
                .thenReturn(new RoomReadStateAdvance(state, false));

        service.update("user-1", "room-1", 55);
        service.update("user-1", "room-1", 49);

        verify(advanceObserver, never()).onAdvanced(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void observerFailureDoesNotChangeSuccessfulReadState() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());
        RoomReadState state = new RoomReadState(
                "membership-1", "room-1", "user-1", 55, NOW);
        when(store.advance(
                "membership-1", "room-1", "user-1", 55, NOW))
                .thenReturn(new RoomReadStateAdvance(state, true));
        doThrow(new IllegalStateException("observer failed"))
                .when(advanceObserver).onAdvanced(
                        "room-1", "membership-1", 1, 55);

        ReadStateResult result = service.update(
                "user-1", "room-1", 55);

        assertThat(result.updated()).isTrue();
        assertThat(result.readThroughSequence()).isEqualTo(55);
    }

    @Test
    void returnsHigherConcurrentCursorAsMonotonicAcknowledgement() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());
        RoomReadState state = new RoomReadState(
                "membership-1", "room-1", "user-1", 60, NOW);
        when(store.advance(
                "membership-1", "room-1", "user-1", 55, NOW))
                .thenReturn(new RoomReadStateAdvance(state, false));

        ReadStateResult result = service.update(
                "user-1", "room-1", 55);

        assertThat(result.readThroughSequence()).isEqualTo(60);
        assertThat(result.updated()).isFalse();
    }

    @Test
    void advanceBelowRequestRemainsNonRetryableConsistencyFailure() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());
        RoomReadState state = new RoomReadState(
                "membership-1", "room-1", "user-1", 54, NOW);
        when(store.advance(
                "membership-1", "room-1", "user-1", 55, NOW))
                .thenReturn(new RoomReadStateAdvance(state, true));

        assertThatThrownBy(() -> service.update(
                "user-1", "room-1", 55))
                .isInstanceOf(IllegalStateException.class)
                .isNotInstanceOf(RoomInboxException.class)
                .hasMessage(
                        "Advanced read state is below requested sequence");
    }

    @Test
    void advanceIdentityMismatchRemainsNonRetryableConsistencyFailure() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());
        RoomReadState state = new RoomReadState(
                "membership-2", "room-1", "user-1", 55, NOW);
        when(store.advance(
                "membership-1", "room-1", "user-1", 55, NOW))
                .thenReturn(new RoomReadStateAdvance(state, true));

        assertThatThrownBy(() -> service.update(
                "user-1", "room-1", 55))
                .isInstanceOf(IllegalStateException.class)
                .isNotInstanceOf(RoomInboxException.class)
                .hasMessage(
                        "Room read state identity does not match membership");
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

    @Test
    void rejectsMembershipBoundaryAheadOfPersistedRoomSequence() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());
        when(sequenceReader.currentSequence("room-1"))
                .thenReturn(49L);

        assertThatThrownBy(() -> service.update(
                "user-1", "room-1", 49))
                .isInstanceOfSatisfying(
                        RoomInboxException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(RoomInboxErrorCode
                                        .READ_STATE_INCONSISTENT));
    }

    @Test
    void rejectsStoredCursorAheadOfPersistedRoomSequence() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.of(new RoomReadState(
                        "membership-1",
                        "room-1",
                        "user-1",
                        61,
                        NOW)));

        assertThatThrownBy(() -> service.update(
                "user-1", "room-1", 55))
                .isInstanceOfSatisfying(
                        RoomInboxException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(RoomInboxErrorCode
                                        .READ_STATE_INCONSISTENT));
    }

    @Test
    void classifiesEveryReadStateStorageBoundaryAsUnavailable() {
        for (StoragePoint point : StoragePoint.values()) {
            assertStorageFailure(point);
        }
    }

    @Test
    void identityMismatchRemainsNonRetryableProgrammingFailure() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.of(new RoomReadState(
                        "membership-1",
                        "different-room",
                        "user-1",
                        50,
                        NOW)));

        assertThatThrownBy(() -> service.update(
                "user-1", "room-1", 50))
                .isInstanceOf(IllegalStateException.class)
                .isNotInstanceOf(RoomInboxException.class);
    }

    @Test
    void duplicateKeyAfterAdvanceRetryRemainsNonRetryable() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());
        DuplicateKeyException duplicate = new DuplicateKeyException(
                "duplicate identity");
        when(store.advance(
                "membership-1", "room-1", "user-1", 55, NOW))
                .thenThrow(duplicate);

        assertThatThrownBy(() -> service.update(
                "user-1", "room-1", 55)).isSameAs(duplicate);
    }

    @Test
    void exhaustedAdvanceRaceIsRetryableStorageFailure() {
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());
        when(store.advance(
                "membership-1", "room-1", "user-1", 55, NOW))
                .thenThrow(new ConcurrencyFailureException(
                        "internal cursor race"));

        assertThatThrownBy(() -> service.update(
                "user-1", "room-1", 55))
                .isInstanceOfSatisfying(
                        RoomInboxException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(RoomInboxErrorCode
                                        .ROOM_INBOX_UNAVAILABLE));
    }

    private void assertStorageFailure(StoragePoint point) {
        setUp();
        when(store.findByMembershipId("membership-1"))
                .thenReturn(Optional.empty());
        when(store.advance(
                "membership-1", "room-1", "user-1", 55, NOW))
                .thenReturn(new RoomReadStateAdvance(
                        new RoomReadState(
                                "membership-1",
                                "room-1",
                                "user-1",
                                55,
                                NOW),
                        true));
        switch (point) {
            case MEMBERSHIP -> when(roomReader.findMembership(
                    "room-1", "user-1")).thenThrow(storageFailure());
            case ROOM -> when(roomReader.findRoomById(
                    "room-1")).thenThrow(storageFailure());
            case READ_STATE -> when(store.findByMembershipId(
                    "membership-1")).thenThrow(storageFailure());
            case SEQUENCE -> when(sequenceReader.currentSequence(
                    "room-1")).thenThrow(storageFailure());
            case ADVANCE -> when(store.advance(
                    "membership-1", "room-1", "user-1", 55, NOW))
                    .thenThrow(storageFailure());
        }

        assertThatThrownBy(() -> service.update(
                "user-1", "room-1", 55))
                .isInstanceOfSatisfying(
                        RoomInboxException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(RoomInboxErrorCode
                                        .ROOM_INBOX_UNAVAILABLE));
    }

    private DataAccessResourceFailureException storageFailure() {
        return new DataAccessResourceFailureException(
                "internal storage detail");
    }

    private enum StoragePoint {
        MEMBERSHIP,
        ROOM,
        READ_STATE,
        SEQUENCE,
        ADVANCE
    }

    private Room activeRoom() {
        return Room.restore(
                "room-1",
                "Room",
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "membership-owner",
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
