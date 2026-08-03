package com.hamcheeze.chat.room.inbox;

public record ReadStateResult(
        String roomId,
        long readThroughSequence,
        boolean updated
) {
}
