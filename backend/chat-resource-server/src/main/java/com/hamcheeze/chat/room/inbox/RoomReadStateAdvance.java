package com.hamcheeze.chat.room.inbox;

import java.util.Objects;

/**
 * Result of a monotonic {@link RoomReadStateStore#advance} operation.
 *
 * @param state persisted state observed after the advance attempt; its cursor
 *              is at least the cursor requested by the invocation
 * @param updated {@code true} when this invocation performed an insert or a
 *                cursor-increasing write, or {@code false} when no write was
 *                needed because an equal or higher cursor was already stored
 */
public record RoomReadStateAdvance(
        RoomReadState state,
        boolean updated
) {
    public RoomReadStateAdvance {
        Objects.requireNonNull(state, "state");
    }
}
