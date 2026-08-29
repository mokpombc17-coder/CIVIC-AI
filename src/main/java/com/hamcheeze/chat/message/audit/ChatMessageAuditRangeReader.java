package com.hamcheeze.chat.message.audit;

import java.time.Instant;
import java.util.List;

public interface ChatMessageAuditRangeReader {

    List<ChatMessageAuditEvent> findChangesInRange(
            String roomId,
            Instant fromInclusive,
            Instant toExclusive,
            long upToSequenceInclusive,
            ChatMessageAuditRangeCursor afterExclusive,
            int limit);
}
