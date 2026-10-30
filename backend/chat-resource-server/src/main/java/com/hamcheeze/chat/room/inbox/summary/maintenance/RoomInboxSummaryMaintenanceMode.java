package com.hamcheeze.chat.room.inbox.summary.maintenance;

public enum RoomInboxSummaryMaintenanceMode {
    DRY_RUN("dry-run"),
    APPLY("apply"),
    VALIDATE("validate");

    private final String commandValue;

    RoomInboxSummaryMaintenanceMode(String commandValue) {
        this.commandValue = commandValue;
    }

    public String commandValue() {
        return commandValue;
    }

    public static RoomInboxSummaryMaintenanceMode parse(String value) {
        for (RoomInboxSummaryMaintenanceMode mode : values()) {
            if (mode.commandValue.equals(value)) {
                return mode;
            }
        }
        throw new IllegalArgumentException(
                "Unsupported maintenance mode: " + value);
    }
}
