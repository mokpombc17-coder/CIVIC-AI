package com.hamcheeze.chat.room.receipt;

public record RoomReadReceiptPosition(
        String membershipId,
        long membershipVersion,
        long messageVisibleAfterSequence,
        long storedLastReadSequence
) {

    public RoomReadReceiptPosition {
        requireText(membershipId, "membershipId");
        if (membershipVersion < 0) {
            throw new IllegalArgumentException(
                    "membershipVersion must not be negative");
        }
        if (messageVisibleAfterSequence < 0) {
            throw new IllegalArgumentException(
                    "messageVisibleAfterSequence must not be negative");
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
