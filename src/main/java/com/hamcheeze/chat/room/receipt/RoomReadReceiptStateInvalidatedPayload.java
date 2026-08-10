package com.hamcheeze.chat.room.receipt;

public record RoomReadReceiptStateInvalidatedPayload(
        String roomId,
        String cause
) implements RoomReadReceiptEventPayload {

    public static final String DELTA_GAP_POSSIBLE =
            "DELTA_GAP_POSSIBLE";

    public RoomReadReceiptStateInvalidatedPayload {
        requireText(roomId, "roomId");
        if (!DELTA_GAP_POSSIBLE.equals(cause)) {
            throw new IllegalArgumentException(
                    "Unsupported invalidation cause");
        }
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
    }
}
