package com.hamcheeze.chat.room;

import java.util.Objects;

public record CloseRoomTransition(
        Outcome outcome,
        Room room,
        Membership ownerMembership
) {

    public enum Outcome {
        CLOSED,
        ALREADY_CLOSED
    }

    public CloseRoomTransition {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(room, "room");
        Objects.requireNonNull(
                ownerMembership,
                "ownerMembership");
    }
}
