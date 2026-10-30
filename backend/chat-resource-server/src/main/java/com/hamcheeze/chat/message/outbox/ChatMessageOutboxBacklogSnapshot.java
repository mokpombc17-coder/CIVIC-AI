package com.hamcheeze.chat.message.outbox;

import java.time.Instant;

public record ChatMessageOutboxBacklogSnapshot(
        long pendingCount,
        Instant oldestOccurredAt,
        long unsupportedCount
) {

    public ChatMessageOutboxBacklogSnapshot {
        if (pendingCount < 0 || unsupportedCount < 0) {
            throw new IllegalArgumentException(
                    "Outbox counts must not be negative");
        }
    }
}
