package com.hamcheeze.chat.room.persistence;

import java.util.Objects;

public record StoredRoomCommandResult(
        String resultType,
        int resultSchemaVersion,
        String payload
) {

    public StoredRoomCommandResult {
        if (resultType == null || resultType.isBlank()) {
            throw new IllegalArgumentException(
                    "resultType must not be blank");
        }
        if (resultSchemaVersion < 1) {
            throw new IllegalArgumentException(
                    "resultSchemaVersion must be at least 1");
        }
        Objects.requireNonNull(payload, "payload");
    }
}
