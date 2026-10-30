package com.hamcheeze.chat.room;

import java.util.Objects;

public record JoinRoomTransition(
        Outcome outcome,
        Room room,
        Membership membership,
        boolean membershipCreated
) {

    public enum Outcome {
        JOINED,
        REJOINED,
        ALREADY_ACTIVE
    }

    public JoinRoomTransition {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(room, "room");
        Objects.requireNonNull(membership, "membership");
        if (membershipCreated != (outcome == Outcome.JOINED)) {
            throw new IllegalArgumentException(
                    "membershipCreated must match JOINED outcome");
        }
    }
}
