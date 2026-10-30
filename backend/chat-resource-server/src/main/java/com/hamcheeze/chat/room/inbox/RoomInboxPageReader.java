package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.query.CursorSlice;

public interface RoomInboxPageReader {

    CursorSlice<RoomInboxPageEntry> findPage(
            String userId,
            RoomInboxCursor cursor,
            int limit);
}
