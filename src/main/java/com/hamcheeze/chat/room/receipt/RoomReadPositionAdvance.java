package com.hamcheeze.chat.room.receipt;

public record RoomReadPositionAdvance(
        String membershipId,
        long membershipVersion,
        long storedLastReadSequence
) {

    public RoomReadPositionAdvance {
        requireText(membershipId, "membershipId");
        if (membershipVersion < 0) {
            throw new IllegalArgumentException(
                    "membershipVersion must not be negative");
        }
        if (storedLastReadSequence < 0) {
            throw new IllegalArgumentException(
                    "storedLastReadSequence must not be negative");
        }
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
    }
}
