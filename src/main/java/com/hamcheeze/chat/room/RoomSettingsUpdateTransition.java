package com.hamcheeze.chat.room;

import java.util.Objects;

public record RoomSettingsUpdateTransition(
        RoomSettingsUpdateOutcome outcome,
        Room room
) {

    public RoomSettingsUpdateTransition {
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(room, "room");
    }
}
