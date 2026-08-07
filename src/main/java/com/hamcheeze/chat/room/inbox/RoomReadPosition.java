package com.hamcheeze.chat.room.inbox;

public record RoomReadPosition(
        long messageVisibleAfterSequence,
        long storedLastReadSequence,
        long effectiveReadThroughSequence
) {

    public RoomReadPosition {
        if (messageVisibleAfterSequence < 0) {
            throw new IllegalArgumentException(
                    "messageVisibleAfterSequence must not be negative");
        }
        if (storedLastReadSequence < 0) {
            throw new IllegalArgumentException(
                    "storedLastReadSequence must not be negative");
        }
        long expectedEffective = Math.max(
                messageVisibleAfterSequence,
                storedLastReadSequence);
        if (effectiveReadThroughSequence != expectedEffective) {
            throw new IllegalArgumentException(
                    "effectiveReadThroughSequence must equal the maximum "
                            + "of the visibility boundary and stored cursor");
        }
    }
}
