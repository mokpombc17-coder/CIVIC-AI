package com.hamcheeze.chat.room;

import java.util.Objects;

public record LeaveRoomTransition(
        Outcome outcome,
        Room room,
        Membership membership
) {

    public enum Outcome {
        LEFT,
        ALREADY_LEFT
    }

    public LeaveRoomTransition {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(room, "room");
        Objects.requireNonNull(membership, "membership");
    }
}
