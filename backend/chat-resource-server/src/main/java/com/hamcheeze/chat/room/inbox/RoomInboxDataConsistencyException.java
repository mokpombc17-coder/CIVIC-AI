package com.hamcheeze.chat.room.inbox;

public final class RoomInboxDataConsistencyException
        extends RuntimeException {

    private final String roomId;
    private final Integer schemaVersion;
    private final String failureKind;

    public RoomInboxDataConsistencyException(
            String roomId,
            Integer schemaVersion,
            String failureKind
    ) {
        super("Room inbox data is inconsistent: " + failureKind);
        this.roomId = roomId;
        this.schemaVersion = schemaVersion;
        this.failureKind = failureKind;
    }

    public String roomId() {
        return roomId;
    }

    public Integer schemaVersion() {
        return schemaVersion;
    }

    public String failureKind() {
        return failureKind;
    }
}
