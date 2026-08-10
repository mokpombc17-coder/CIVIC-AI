package com.hamcheeze.chat.room.receipt;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record RoomReadReceiptState(
        String roomId,
        long roomVersion,
        String selfMembershipId,
        List<RoomReadReceiptPosition> positions,
        Instant generatedAt
) {

    public RoomReadReceiptState {
        requireText(roomId, "roomId");
        if (roomVersion < 0) {
            throw new IllegalArgumentException(
                    "roomVersion must not be negative");
        }
        requireText(selfMembershipId, "selfMembershipId");
        positions = List.copyOf(
                Objects.requireNonNull(positions, "positions"));
        Objects.requireNonNull(generatedAt, "generatedAt");
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
    }
}
