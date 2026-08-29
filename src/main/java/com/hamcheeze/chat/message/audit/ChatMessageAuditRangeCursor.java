package com.hamcheeze.chat.message.audit;

import java.time.Instant;
import java.util.Objects;

public record ChatMessageAuditRangeCursor(
        Instant occurredAt,
        long roomChangeSequence
) {

    public ChatMessageAuditRangeCursor {
        Objects.requireNonNull(occurredAt, "occurredAt");
        if (roomChangeSequence < 0) {
            throw new IllegalArgumentException(
                    "roomChangeSequence must not be negative");
        }
    }

    public static ChatMessageAuditRangeCursor startAt(
            Instant fromInclusive
    ) {
        return new ChatMessageAuditRangeCursor(fromInclusive, 0);
    }

    public static ChatMessageAuditRangeCursor after(
            ChatMessageAuditEvent event
    ) {
        Objects.requireNonNull(event, "event");
        return new ChatMessageAuditRangeCursor(
                event.occurredAt(),
                event.roomChangeSequence());
    }
}
