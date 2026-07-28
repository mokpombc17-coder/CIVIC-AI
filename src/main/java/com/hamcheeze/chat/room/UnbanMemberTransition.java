package com.hamcheeze.chat.room;

import java.util.Objects;

public record UnbanMemberTransition(
        Outcome outcome,
        Room room,
        Membership membership
) {

    public enum Outcome {
        UNBANNED,
        ALREADY_UNBANNED
    }

    public UnbanMemberTransition {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(room, "room");
        Objects.requireNonNull(membership, "membership");
    }
}
