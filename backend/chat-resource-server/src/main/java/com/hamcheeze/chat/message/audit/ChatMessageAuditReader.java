package com.hamcheeze.chat.message.audit;

import java.util.List;

public interface ChatMessageAuditReader {

    long currentRoomChangeSequence(String roomId);

    List<ChatMessageAuditEvent> findChanges(
            String roomId,
            long afterSequenceExclusive,
            long upToSequenceInclusive,
            int limit);
}
