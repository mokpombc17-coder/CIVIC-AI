package com.hamcheeze.chat.export;

import java.time.Instant;
import java.util.Objects;

public record AdminRoomConversationExportSnapshot(
        ChatExportRoomSnapshot room,
        AdminRoomConversationExportRange range,
        long capturedChangeSequence,
        Instant capturedAt
) {

    public AdminRoomConversationExportSnapshot {
        Objects.requireNonNull(room, "room");
        Objects.requireNonNull(range, "range");
        Objects.requireNonNull(capturedAt, "capturedAt");
        if (capturedChangeSequence < 0
                || range.toExclusive().isAfter(capturedAt)) {
            throw new IllegalArgumentException(
                    "Malformed admin room conversation export snapshot");
        }
    }
}
