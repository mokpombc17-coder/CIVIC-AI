package com.hamcheeze.chat.room.application.access;

public record RoomAccessRevocationSummary(
        int matchedConnections,
        int closedConnections,
        int alreadyClosedOrMissingConnections,
        int failedConnections
) {

    public RoomAccessRevocationSummary {
        if (matchedConnections < 0
                || closedConnections < 0
                || alreadyClosedOrMissingConnections < 0
                || failedConnections < 0
                || closedConnections
                + alreadyClosedOrMissingConnections
                + failedConnections != matchedConnections) {
            throw new IllegalArgumentException(
                    "Invalid access revocation summary");
        }
    }

    public static RoomAccessRevocationSummary noOp() {
        return new RoomAccessRevocationSummary(0, 0, 0, 0);
    }
}
