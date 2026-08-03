package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.CursorPage;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.hamcheeze.chat.room.query.RoomQueryCursor;
import com.hamcheeze.chat.room.query.RoomQueryCursorCodec;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RoomInboxServiceTest {

    @Test
    void batchesReadStatesAndCountsRoomsSequentially() {
        Instant now = Instant.parse("2026-08-03T01:00:00Z");
        Membership membership = Membership.restore(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                now,
                null,
                null,
                50,
                1);
        Room room = Room.restore(
                "room-1",
                "Room",
                "description",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                2,
                now,
                null,
                3);
        RoomQueryReader reader = mock(RoomQueryReader.class);
        RoomReadStateStore store = mock(RoomReadStateStore.class);
        UnreadCountReader unread = mock(UnreadCountReader.class);
        RoomQueryCursorCodec codec = mock(RoomQueryCursorCodec.class);
        when(codec.decode(
                null,
                RoomQueryCursor.Scope.MY_ROOM_INBOX,
                MembershipStatus.ACTIVE)).thenReturn(null);
        when(reader.findMembershipsByUserAndStatus(
                "user-1", MembershipStatus.ACTIVE, null, 20))
                .thenReturn(new CursorSlice<>(
                        List.of(membership), false));
        when(reader.findRoomsByIds(List.of("room-1")))
                .thenReturn(List.of(room));
        when(store.findByMembershipIds(List.of("membership-1")))
                .thenReturn(Map.of(
                        "membership-1",
                        new RoomReadState(
                                "membership-1",
                                "room-1",
                                "user-1",
                                55,
                                now)));
        when(unread.count("room-1", "user-1", 55))
                .thenReturn(new UnreadCount(200, true));
        RoomInboxService service = new RoomInboxService(
                reader,
                store,
                unread,
                codec,
                new SimpleMeterRegistry());

        CursorPage<com.hamcheeze.chat.room.inbox.model.RoomInboxView>
                page = service.inbox("user-1", null, 20);

        assertThat(page.items()).singleElement()
                .satisfies(item -> {
                    assertThat(item.readThroughSequence())
                            .isEqualTo(55);
                    assertThat(item.unreadCount()).isEqualTo(200);
                    assertThat(item.unreadCountCapped()).isTrue();
                });
        verify(unread).count("room-1", "user-1", 55);
    }
}
