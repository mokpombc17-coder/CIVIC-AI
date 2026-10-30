package com.hamcheeze.chat.room.inbox.notification;

import java.time.Instant;
import java.util.UUID;

public record PublicRoomsInvalidatedEvent(
        int eventVersion,
        String eventId,
        String eventType,
        Instant emittedAt
) {

    public static final int CURRENT_EVENT_VERSION = 1;
    public static final String EVENT_TYPE = "PUBLIC_ROOMS_INVALIDATED";

    public PublicRoomsInvalidatedEvent {
        if (eventVersion != CURRENT_EVENT_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported public rooms event version");
        }
        requireCanonicalUuid(eventId);
        if (!EVENT_TYPE.equals(eventType)) {
            throw new IllegalArgumentException(
                    "Unsupported public rooms event type");
        }
        if (emittedAt == null) {
            throw new IllegalArgumentException(
                    "emittedAt must not be null");
        }
    }

    public static PublicRoomsInvalidatedEvent create(
            String eventId,
            Instant emittedAt
    ) {
        return new PublicRoomsInvalidatedEvent(
                CURRENT_EVENT_VERSION,
                eventId,
                EVENT_TYPE,
                emittedAt);
    }

    private static void requireCanonicalUuid(String eventId) {
        try {
            if (eventId == null
                    || !UUID.fromString(eventId).toString()
                    .equals(eventId)) {
                throw new IllegalArgumentException(
                        "eventId must be a canonical UUID");
            }
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "eventId must be a canonical UUID", exception);
        }
    }
}
