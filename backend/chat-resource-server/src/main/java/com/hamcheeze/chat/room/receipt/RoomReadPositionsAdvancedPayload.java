package com.hamcheeze.chat.room.receipt;

import java.util.List;
import java.util.Objects;

public record RoomReadPositionsAdvancedPayload(
        String roomId,
        List<RoomReadPositionAdvance> updates
) implements RoomReadReceiptEventPayload {

    public RoomReadPositionsAdvancedPayload {
        requireText(roomId, "roomId");
        updates = List.copyOf(
                Objects.requireNonNull(updates, "updates"));
        if (updates.isEmpty()) {
            throw new IllegalArgumentException(
                    "updates must not be empty");
        }
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
    }
}
