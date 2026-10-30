package com.hamcheeze.chat.room;

import java.util.Objects;

public record OwnershipTransferTransition(
        Outcome outcome,
        Room room,
        Membership previousOwnerMembership,
        Membership newOwnerMembership
) {

    public enum Outcome {
        OWNERSHIP_TRANSFERRED
    }

    public OwnershipTransferTransition {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(room, "room");
        Objects.requireNonNull(
                previousOwnerMembership,
                "previousOwnerMembership");
        Objects.requireNonNull(
                newOwnerMembership,
                "newOwnerMembership");
    }
}
