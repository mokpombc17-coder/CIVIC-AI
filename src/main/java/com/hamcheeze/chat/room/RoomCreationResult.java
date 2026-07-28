package com.hamcheeze.chat.room;

import java.util.Objects;

public record RoomCreationResult(
        Outcome outcome,
        Room room,
        Membership ownerMembership
) {

    public enum Outcome {
        CREATED
    }

    public RoomCreationResult {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(room, "room");
        Objects.requireNonNull(
                ownerMembership,
                "ownerMembership");
    }
}
