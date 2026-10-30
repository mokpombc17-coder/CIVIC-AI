package com.hamcheeze.chat.room.receipt;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record RoomReadReceiptEventEnvelope(
        int eventVersion,
        String eventId,
        RoomReadReceiptEventType eventType,
        Instant emittedAt,
        RoomReadReceiptEventPayload payload
) {

    public static final int CURRENT_EVENT_VERSION = 1;

    public RoomReadReceiptEventEnvelope {
        if (eventVersion != CURRENT_EVENT_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported Read Receipt event version");
        }
        requireCanonicalUuid(eventId);
        Objects.requireNonNull(eventType, "eventType");
        Objects.requireNonNull(emittedAt, "emittedAt");
        Objects.requireNonNull(payload, "payload");
        if (eventType == RoomReadReceiptEventType
                .ROOM_READ_POSITIONS_ADVANCED
                && !(payload instanceof
                RoomReadPositionsAdvancedPayload)
                || eventType == RoomReadReceiptEventType
                .ROOM_READ_RECEIPT_STATE_INVALIDATED
                && !(payload instanceof
                RoomReadReceiptStateInvalidatedPayload)) {
            throw new IllegalArgumentException(
                    "Read Receipt event type and payload do not match");
        }
    }

    private static void requireCanonicalUuid(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    "eventId must not be blank");
        }
        try {
            if (!UUID.fromString(value).toString().equals(value)) {
                throw new IllegalArgumentException(
                        "eventId must be a canonical UUID");
            }
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "eventId must be a canonical UUID", exception);
        }
    }
}
