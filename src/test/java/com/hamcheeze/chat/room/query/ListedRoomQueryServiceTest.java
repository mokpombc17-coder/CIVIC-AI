package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.model.ListedRoomView;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ListedRoomQueryServiceTest {

    private static final ListedRoomQueryCriteria UNFILTERED =
            new ListedRoomQueryCriteria(null, null, null);

    private final RoomQueryReader reader =
            mock(RoomQueryReader.class);
    private final ListedRoomQueryCursorCodec cursorCodec =
            new ListedRoomQueryCursorCodec(
                    JsonMapper.builder().build());
    private final ListedRoomQueryService service =
            new ListedRoomQueryService(reader, cursorCodec);

    @Test
    void returnsListedActiveRoomsWithOpaqueNextCursor() {
        when(reader.findListedRooms(
                UNFILTERED,
                null,
                2))
                .thenReturn(new CursorSlice<>(
                        List.of(
                                room("room-a", "Alpha"),
                                room("room-b", "Beta")),
                        true));

        CursorPage<ListedRoomView> first =
                service.listedRooms(UNFILTERED, null, 2);

        assertThat(first.items())
                .extracting(ListedRoomView::roomId)
                .containsExactly("room-a", "room-b");
        assertThat(first.items())
                .extracting(ListedRoomView::name)
                .containsExactly("Alpha", "Beta");
        assertThat(first.hasNext()).isTrue();
        assertThat(first.nextCursor()).isNotBlank();

        ListedRoomQueryCursor cursor =
                cursorCodec.decode(
                        first.nextCursor(),
                        UNFILTERED);
        assertThat(cursor.lastRoomId()).isEqualTo("room-b");
        assertThat(cursor.version()).isEqualTo(2);
        verify(reader).findListedRooms(
                UNFILTERED,
                null,
                2);
    }

    @Test
    void lastPageHasNoCursor() {
        ListedRoomQueryCursor cursor =
                new ListedRoomQueryCursor(
                        ListedRoomQueryCursor.CURRENT_VERSION,
                        ListedRoomQueryCursor.Scope.LISTED_ROOMS,
                        UNFILTERED,
                        "room-a");
        String token = cursorCodec.encode(cursor);
        when(reader.findListedRooms(
                UNFILTERED,
                "room-a",
                20))
                .thenReturn(new CursorSlice<>(
                        List.of(room("room-b", "Beta")),
                        false));

        CursorPage<ListedRoomView> page =
                service.listedRooms(UNFILTERED, token, 20);

        assertThat(page.items())
                .extracting(ListedRoomView::roomId)
                .containsExactly("room-b");
        assertThat(page.hasNext()).isFalse();
        assertThat(page.nextCursor()).isNull();
    }

    private Room room(String roomId, String name) {
        return Room.restore(
                roomId,
                name,
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                Instant.parse("2026-07-29T00:00:00Z"),
                null,
                0);
    }
}
