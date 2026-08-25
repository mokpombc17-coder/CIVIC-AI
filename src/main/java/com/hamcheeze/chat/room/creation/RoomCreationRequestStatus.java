package com.hamcheeze.chat.room.creation;

public enum RoomCreationRequestStatus {
    PENDING(false),
    APPROVED(true),
    REJECTED(true),
    CANCELED(true);

    private final boolean terminal;

    RoomCreationRequestStatus(boolean terminal) {
        this.terminal = terminal;
    }

    public boolean terminal() {
        return terminal;
    }

    public boolean canTransitionTo(
            RoomCreationRequestStatus target
    ) {
        return this == PENDING
                && target != null
                && target.terminal();
    }
}
