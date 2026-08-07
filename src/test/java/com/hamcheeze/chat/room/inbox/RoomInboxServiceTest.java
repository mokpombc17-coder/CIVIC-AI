package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.query.CursorPage;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.hamcheeze.chat.room.query.RoomQueryErrorCode;
import com.hamcheeze.chat.room.query.RoomQueryException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.dao.QueryTimeoutException;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RoomInboxServiceTest {

    @Test
    void batchesReadStatesAndPreservesReaderOrder() {
        RoomInboxPageEntry first = entry(
                "room-b", "membership-b", 50,
                Instant.parse("2026-08-03T02:00:00Z"));
        RoomInboxPageEntry second = entry(
                "room-a", "membership-a", 10,
                Instant.parse("2026-08-03T01:00:00Z"));
        RoomInboxPageReader reader = mock(RoomInboxPageReader.class);
        RoomReadStateStore store = mock(RoomReadStateStore.class);
        UnreadCountReader unread = mock(UnreadCountReader.class);
        RoomInboxCursorCodec codec = mock(RoomInboxCursorCodec.class);
        when(codec.decode(null)).thenReturn(null);
        when(reader.findPage("user-1", null, 20))
                .thenReturn(new CursorSlice<>(
                        List.of(first, second), false));
        when(store.findByMembershipIds(List.of(
                "membership-b", "membership-a")))
                .thenReturn(Map.of(
                        "membership-b",
                        new RoomReadState(
                                "membership-b", "room-b", "user-1",
                                55, first.lastActivityAt())));
        when(unread.count("room-b", "user-1", 55))
                .thenReturn(new UnreadCount(200, true));
        when(unread.count("room-a", "user-1", 10))
                .thenReturn(new UnreadCount(3, false));
        RoomInboxService service = service(
                reader, store, unread, codec);

        CursorPage<com.hamcheeze.chat.room.inbox.model.RoomInboxView>
                page = service.inbox("user-1", null, 20);

        assertThat(page.items())
                .extracting(item -> item.roomId())
                .containsExactly("room-b", "room-a");
        assertThat(page.items().getFirst().readThroughSequence())
                .isEqualTo(55);
        assertThat(page.items().getFirst().unreadCount()).isEqualTo(200);
        assertThat(page.items().getFirst().unreadCountCapped()).isTrue();
        assertThat(page.items().getFirst().lastActivityAt())
                .isEqualTo(first.lastActivityAt());
        verify(unread).count("room-b", "user-1", 55);
        verify(unread).count("room-a", "user-1", 10);
    }

    @Test
    void nextCursorUsesLastReturnedEffectiveActivityAndRoomId() {
        RoomInboxPageEntry entry = entry(
                "room-a", "membership-a", 0,
                Instant.parse("2026-08-03T01:00:00Z"));
        RoomInboxPageReader reader = mock(RoomInboxPageReader.class);
        RoomReadStateStore store = mock(RoomReadStateStore.class);
        UnreadCountReader unread = mock(UnreadCountReader.class);
        RoomInboxCursorCodec codec = mock(RoomInboxCursorCodec.class);
        when(codec.decode(null)).thenReturn(null);
        when(reader.findPage("user-1", null, 20))
                .thenReturn(new CursorSlice<>(List.of(entry), true));
        when(store.findByMembershipIds(List.of("membership-a")))
                .thenReturn(Map.of());
        when(unread.count("room-a", "user-1", 0))
                .thenReturn(new UnreadCount(0, false));
        RoomInboxCursor expected = new RoomInboxCursor(
                2,
                RoomInboxCursor.Scope.MY_ROOM_INBOX,
                entry.lastActivityAt(),
                "room-a");
        when(codec.encode(expected)).thenReturn("next");

        CursorPage<?> page = service(reader, store, unread, codec)
                .inbox("user-1", null, 20);

        assertThat(page.nextCursor()).isEqualTo("next");
        assertThat(page.hasNext()).isTrue();
        verify(codec).encode(expected);
    }

    @Test
    void deletedLastMessageRemainsWhileReadStateMakesUnreadZero() {
        Instant createdAt = Instant.parse("2026-08-03T01:00:00Z");
        RoomInboxPageEntry base = entry(
                "room-a", "membership-a", 0, createdAt);
        RoomInboxLastMessage tombstone = new RoomInboxLastMessage(
                "message-1",
                1,
                2,
                MessageState.DELETED_BY_AUTHOR,
                null,
                false,
                createdAt);
        RoomInboxPageEntry entry = new RoomInboxPageEntry(
                base.room(), base.membership(), tombstone, createdAt);
        RoomInboxPageReader reader = mock(RoomInboxPageReader.class);
        RoomReadStateStore store = mock(RoomReadStateStore.class);
        UnreadCountReader unread = mock(UnreadCountReader.class);
        RoomInboxCursorCodec codec = mock(RoomInboxCursorCodec.class);
        when(codec.decode(null)).thenReturn(null);
        when(reader.findPage("user-1", null, 20))
                .thenReturn(new CursorSlice<>(List.of(entry), false));
        when(store.findByMembershipIds(List.of("membership-a")))
                .thenReturn(Map.of(
                        "membership-a",
                        new RoomReadState(
                                "membership-a", "room-a", "user-1",
                                1, createdAt.plusSeconds(1))));
        when(unread.count("room-a", "user-1", 1))
                .thenReturn(new UnreadCount(0, false));

        var item = service(reader, store, unread, codec)
                .inbox("user-1", null, 20)
                .items().getFirst();

        assertThat(item.unreadCount()).isZero();
        assertThat(item.lastMessage()).isEqualTo(tombstone);
        assertThat(item.lastActivityAt()).isEqualTo(createdAt);
    }

    @Test
    void queryAndUnreadStorageFailuresAreRetryable() {
        assertRetryableInboxFailure(new QueryTimeoutException("timeout"));
        assertRetryableInboxFailure(new DataAccessResourceFailureException(
                "connection unavailable"));
    }

    @Test
    void dataConsistencyFailureUsesNonRetryableSummaryCode() {
        RoomInboxPageReader reader = mock(RoomInboxPageReader.class);
        when(reader.findPage("user-1", null, 20)).thenThrow(
                new RoomInboxDataConsistencyException(
                        "room-1", 2, "summary-schema-unsupported"));
        RoomInboxCursorCodec codec = mock(RoomInboxCursorCodec.class);
        when(codec.decode(null)).thenReturn(null);

        assertThatThrownBy(() -> service(
                reader,
                mock(RoomReadStateStore.class),
                mock(UnreadCountReader.class),
                codec).inbox("user-1", null, 20))
                .isInstanceOf(RoomInboxException.class)
                .extracting("code")
                .isEqualTo(RoomInboxErrorCode
                        .ROOM_INBOX_SUMMARY_INCONSISTENT);
    }

    @Test
    void invalidHintAndDuplicateKeyRemainNonRetryable() {
        RuntimeException badHint = new InvalidDataAccessApiUsageException(
                "bad hint");
        assertThatThrownBy(() -> failureService(badHint)
                .inbox("user-1", null, 20)).isSameAs(badHint);

        RuntimeException duplicate = new DuplicateKeyException(
                "duplicate");
        assertThatThrownBy(() -> failureService(duplicate)
                .inbox("user-1", null, 20)).isSameAs(duplicate);
    }

    @Test
    void invalidCursorStopsBeforePageReaderQuery() {
        RoomInboxPageReader reader = mock(RoomInboxPageReader.class);
        RoomInboxCursorCodec codec = new RoomInboxCursorCodec(
                JsonMapper.builder().build());
        String cursor = Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString("""
                        {"version":2,"scope":"MY_ROOM_INBOX",
                        "lastActivityAt":
                        "2026-08-04T08:30:00.123000001Z",
                        "lastRoomId":"room-A"}
                        """.getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> service(
                reader,
                mock(RoomReadStateStore.class),
                mock(UnreadCountReader.class),
                codec).inbox("user-1", cursor, 20))
                .isInstanceOf(RoomQueryException.class)
                .extracting("code")
                .isEqualTo(RoomQueryErrorCode.INVALID_CURSOR);
        verifyNoInteractions(reader);
    }

    private void assertRetryableInboxFailure(RuntimeException failure) {
        assertThatThrownBy(() -> failureService(failure)
                .inbox("user-1", null, 20))
                .isInstanceOf(RoomInboxException.class)
                .extracting("code")
                .isEqualTo(RoomInboxErrorCode.ROOM_INBOX_UNAVAILABLE);
    }

    private RoomInboxService failureService(RuntimeException failure) {
        RoomInboxPageReader reader = mock(RoomInboxPageReader.class);
        RoomInboxCursorCodec codec = mock(RoomInboxCursorCodec.class);
        when(codec.decode(null)).thenReturn(null);
        when(reader.findPage("user-1", null, 20)).thenThrow(failure);
        return service(
                reader,
                mock(RoomReadStateStore.class),
                mock(UnreadCountReader.class),
                codec);
    }

    private static RoomInboxService service(
            RoomInboxPageReader reader,
            RoomReadStateStore store,
            UnreadCountReader unread,
            RoomInboxCursorCodec codec
    ) {
        return new RoomInboxService(
                reader,
                store,
                new RoomReadPositionResolver(),
                unread,
                codec,
                new SimpleMeterRegistry());
    }

    private static RoomInboxPageEntry entry(
            String roomId,
            String membershipId,
            long boundary,
            Instant activityAt
    ) {
        Membership membership = Membership.restore(
                membershipId,
                roomId,
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                activityAt.minusSeconds(100),
                null,
                null,
                boundary,
                1);
        Room room = Room.restore(
                roomId,
                roomId,
                "description",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                2,
                activityAt.minusSeconds(200),
                null,
                3);
        return new RoomInboxPageEntry(
                room, membership, null, activityAt);
    }
}
