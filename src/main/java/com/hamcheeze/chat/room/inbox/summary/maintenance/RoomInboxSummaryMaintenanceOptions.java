package com.hamcheeze.chat.room.inbox.summary.maintenance;

import java.util.HashMap;
import java.util.Map;

public record RoomInboxSummaryMaintenanceOptions(
        RoomInboxSummaryMaintenanceMode mode,
        String roomId,
        String afterRoomId,
        int batchSize,
        int maxRoomRetries
) {

    public static final int DEFAULT_BATCH_SIZE = 100;
    public static final int DEFAULT_MAX_ROOM_RETRIES = 3;

    public RoomInboxSummaryMaintenanceOptions {
        if (mode == null) {
            throw new IllegalArgumentException("mode is required");
        }
        roomId = optionalText(roomId, "room-id");
        afterRoomId = optionalText(afterRoomId, "after-room-id");
        if (roomId != null && afterRoomId != null) {
            throw new IllegalArgumentException(
                    "room-id and after-room-id cannot be combined");
        }
        if (batchSize < 1) {
            throw new IllegalArgumentException(
                    "batch-size must be a positive integer");
        }
        if (maxRoomRetries < 1) {
            throw new IllegalArgumentException(
                    "max-room-retries must be a positive integer");
        }
    }

    public static RoomInboxSummaryMaintenanceOptions parse(String[] args) {
        Map<String, String> values = new HashMap<>();
        for (String argument : args) {
            if (argument == null || !argument.startsWith("--")
                    || !argument.contains("=")) {
                throw new IllegalArgumentException(
                        "Arguments must use --name=value syntax");
            }
            int separator = argument.indexOf('=');
            String name = argument.substring(2, separator);
            String value = argument.substring(separator + 1);
            if (!isSupported(name)) {
                throw new IllegalArgumentException(
                        "Unsupported argument: --" + name);
            }
            if (value.isBlank()) {
                throw new IllegalArgumentException(
                        "Argument value must not be blank: --" + name);
            }
            if (values.putIfAbsent(name, value) != null) {
                throw new IllegalArgumentException(
                        "Duplicate argument: --" + name);
            }
        }
        String modeValue = values.get("mode");
        if (modeValue == null) {
            throw new IllegalArgumentException("--mode is required");
        }
        return new RoomInboxSummaryMaintenanceOptions(
                RoomInboxSummaryMaintenanceMode.parse(modeValue),
                values.get("room-id"),
                values.get("after-room-id"),
                positiveInteger(
                        values.get("batch-size"),
                        DEFAULT_BATCH_SIZE,
                        "batch-size"),
                positiveInteger(
                        values.get("max-room-retries"),
                        DEFAULT_MAX_ROOM_RETRIES,
                        "max-room-retries"));
    }

    private static boolean isSupported(String name) {
        return switch (name) {
            case "mode", "room-id", "after-room-id", "batch-size",
                    "max-room-retries" -> true;
            default -> false;
        };
    }

    private static int positiveInteger(
            String value,
            int defaultValue,
            String name
    ) {
        if (value == null) {
            return defaultValue;
        }
        try {
            int parsed = Integer.parseInt(value);
            if (parsed < 1) {
                throw new NumberFormatException();
            }
            return parsed;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(
                    name + " must be a positive integer", exception);
        }
    }

    private static String optionalText(String value, String name) {
        if (value == null) {
            return null;
        }
        if (value.isBlank()) {
            throw new IllegalArgumentException(
                    name + " must not be blank");
        }
        return value;
    }
}
