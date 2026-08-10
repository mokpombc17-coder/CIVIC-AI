package com.hamcheeze.chat.message.search;

import java.time.Duration;

public interface ChatMessageSearchReader {

    ChatMessageSearchCandidateSlice findCandidates(
            String roomId,
            long messageVisibleAfterSequence,
            long searchUpperBoundSequence,
            Long beforeSequence,
            int limit,
            Duration maxTime
    );
}
