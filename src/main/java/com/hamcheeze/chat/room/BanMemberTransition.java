package com.hamcheeze.chat.room;

import java.util.Objects;

public record BanMemberTransition(
        Outcome outcome,
        Room room,
        Membership membership
) {

    public enum Outcome {
        BANNED,
        ALREADY_BANNED
    }

    public BanMemberTransition {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(room, "room");
        Objects.requireNonNull(membership, "membership");
    }
}
