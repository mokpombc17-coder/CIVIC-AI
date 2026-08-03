package com.hamcheeze.chat.room.inbox;

import java.util.Objects;

public record RoomReadStateAdvance(
        RoomReadState state,
        boolean updated
) {
    public RoomReadStateAdvance {
        Objects.requireNonNull(state, "state");
    }
}
