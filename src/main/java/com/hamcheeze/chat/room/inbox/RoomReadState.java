package com.hamcheeze.chat.room.inbox;

import java.time.Instant;
import java.util.Objects;

public record RoomReadState(
        String membershipId,
        String roomId,
        String userId,
        long lastReadSequence,
        Instant updatedAt
) {

    public RoomReadState {
        requireText(membershipId, "membershipId");
        requireText(roomId, "roomId");
        requireText(userId, "userId");
        if (lastReadSequence < 0) {
            throw new IllegalArgumentException(
                    "lastReadSequence must not be negative");
        }
        Objects.requireNonNull(updatedAt, "updatedAt");
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    name + " must not be blank");
        }
    }
}
