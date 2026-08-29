package com.hamcheeze.chat.room.query;

import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.query.model.AdminRoomView;

import java.util.List;
import java.util.Objects;

public final class AdminRoomQueryService {

    private final RoomQueryReader reader;
    private final AdminRoomQueryCursorCodec cursorCodec;

    public AdminRoomQueryService(
            RoomQueryReader reader,
            AdminRoomQueryCursorCodec cursorCodec
    ) {
        this.reader = Objects.requireNonNull(reader, "reader");
        this.cursorCodec = Objects.requireNonNull(
                cursorCodec,
                "cursorCodec");
    }

    public CursorPage<AdminRoomView> rooms(
            AdminRoomQueryCriteria criteria,
            String cursor,
            int limit
    ) {
        Objects.requireNonNull(criteria, "criteria");
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException(
                    "limit must be between 1 and 100");
        }
        AdminRoomQueryCursor decoded = cursorCodec.decode(
                cursor,
                criteria);
        CursorSlice<Room> rooms = reader.findAdminRooms(
                criteria,
                decoded == null ? null : decoded.lastRoomId(),
                limit);
        List<AdminRoomView> views = rooms.items().stream()
                .map(AdminRoomQueryService::view)
                .toList();
        String nextCursor = null;
        if (rooms.hasNext()) {
            Room last = rooms.items().getLast();
            nextCursor = cursorCodec.encode(
                    new AdminRoomQueryCursor(
                            AdminRoomQueryCursor.CURRENT_VERSION,
                            AdminRoomQueryCursor.Scope.ADMIN_ROOMS,
                            criteria,
                            last.roomId()));
        }
        return new CursorPage<>(views, nextCursor, rooms.hasNext());
    }

    private static AdminRoomView view(Room room) {
        return new AdminRoomView(
                room.roomId(),
                room.name(),
                room.description(),
                room.categoryIds(),
                room.ownerMembershipId(),
                room.status(),
                room.visibility(),
                room.joinPolicy(),
                room.activeMemberCount(),
                room.createdAt(),
                room.version());
    }
}
