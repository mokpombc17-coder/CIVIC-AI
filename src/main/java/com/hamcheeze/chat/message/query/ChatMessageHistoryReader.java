package com.hamcheeze.chat.message.query;

import com.hamcheeze.chat.message.ChatMessage;

import java.util.List;

public interface ChatMessageHistoryReader {

    List<ChatMessage> findLatest(
            String roomId,
            int limit
    );

    List<ChatMessage> findBefore(
            String roomId,
            long beforeSequence,
            int limit
    );

    List<ChatMessage> findAfter(
            String roomId,
            long afterSequence,
            int limit
    );
}
