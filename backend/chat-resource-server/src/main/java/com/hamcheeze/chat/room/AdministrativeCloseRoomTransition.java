package com.hamcheeze.chat.room;

import java.util.List;
import java.util.Objects;

public record AdministrativeCloseRoomTransition(
        Outcome outcome,
        Room room,
        Membership ownerMembership,
        List<Membership> closedMemberships
) {

    public AdministrativeCloseRoomTransition {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(room, "room");
        Objects.requireNonNull(
                ownerMembership,
                "ownerMembership");
        closedMemberships = List.copyOf(
                Objects.requireNonNull(
                        closedMemberships,
                        "closedMemberships"));
    }

    public enum Outcome {
        CLOSED,
        ALREADY_CLOSED
    }
}
