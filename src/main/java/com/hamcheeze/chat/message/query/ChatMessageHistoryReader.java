package com.hamcheeze.chat.message.query;

import com.hamcheeze.chat.message.ChatMessage;

import java.util.List;

public interface ChatMessageHistoryReader {

    List<ChatMessage> findLatest(
            String roomId,
            long messageVisibleAfterSequence,
            int limit
    );

    List<ChatMessage> findBefore(
            String roomId,
            long messageVisibleAfterSequence,
            long beforeSequence,
            int limit
    );

    List<ChatMessage> findAfter(
            String roomId,
            long messageVisibleAfterSequence,
            long afterSequence,
            int limit
    );
}
