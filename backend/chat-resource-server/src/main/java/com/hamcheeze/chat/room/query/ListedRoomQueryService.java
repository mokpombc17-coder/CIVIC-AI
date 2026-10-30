package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.query.model.ListedRoomView;

import java.util.List;
import java.util.Objects;

public final class ListedRoomQueryService {

    private final RoomQueryReader reader;
    private final ListedRoomQueryCursorCodec cursorCodec;

    public ListedRoomQueryService(
            RoomQueryReader reader,
            ListedRoomQueryCursorCodec cursorCodec
    ) {
        this.reader = Objects.requireNonNull(reader, "reader");
        this.cursorCodec =
                Objects.requireNonNull(cursorCodec, "cursorCodec");
    }

    public CursorPage<ListedRoomView> listedRooms(
            ListedRoomQueryCriteria criteria,
            String cursor,
            int limit
    ) {
        Objects.requireNonNull(criteria, "criteria");
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException(
                    "limit must be between 1 and 100");
        }
        ListedRoomQueryCursor decoded = cursorCodec.decode(
                cursor,
                criteria);
        CursorSlice<Room> rooms = reader.findListedRooms(
                criteria,
                decoded == null
                        ? null
                        : new ListedRoomPosition(
                                decoded.lastCreatedAt(),
                                decoded.lastRoomId()),
                limit);
        List<ListedRoomView> views = rooms.items().stream()
                .map(ListedRoomQueryService::view)
                .toList();
        String nextCursor = null;
        if (rooms.hasNext()) {
            Room last = rooms.items().getLast();
            nextCursor = cursorCodec.encode(
                    new ListedRoomQueryCursor(
                            ListedRoomQueryCursor.CURRENT_VERSION,
                            ListedRoomQueryCursor.Scope.LISTED_ROOMS,
                            criteria,
                            last.createdAt(),
                            last.roomId()));
        }
        return new CursorPage<>(
                views,
                nextCursor,
                rooms.hasNext());
    }

    private static ListedRoomView view(Room room) {
        return new ListedRoomView(
                room.roomId(),
                room.name(),
                room.description(),
                room.categoryIds(),
                room.ownerMembershipId(),
                room.ownerUserId(),
                room.status(),
                room.visibility(),
                room.joinPolicy(),
                room.activeMemberCount(),
                room.createdAt(),
                room.version());
    }
}
