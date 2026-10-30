package com.hamcheeze.chat.message.outbox;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

public interface ChatMessageOutboxQueue {

    Optional<ClaimedChatMessageOutboxEvent> claimNext(
            Instant now,
            Duration claimTimeout
    );

    boolean deletePublished(
            String eventId,
            long claimedAttemptCount
    );

    boolean reschedule(
            String eventId,
            long claimedAttemptCount,
            Instant nextAttemptAt,
            String failureType
    );
}
