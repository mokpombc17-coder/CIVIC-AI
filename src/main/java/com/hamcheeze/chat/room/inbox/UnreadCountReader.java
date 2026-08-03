package com.hamcheeze.chat.room.inbox;

public interface UnreadCountReader {

    UnreadCount count(
            String roomId,
            String userId,
            long readThroughSequence);
}
