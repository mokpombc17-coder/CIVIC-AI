package com.hamcheeze.chat.message.context;

import com.hamcheeze.chat.message.ChatMessage;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

public interface ChatMessageContextReader {

    Optional<ChatMessage> findTarget(
            String messageId,
            Duration maxTime
    );

    List<ChatMessage> findBefore(
            String roomId,
            long messageVisibleAfterSequence,
            long targetRoomSequence,
            int limit,
            Duration maxTime
    );

    List<ChatMessage> findAfter(
            String roomId,
            long targetRoomSequence,
            int limit,
            Duration maxTime
    );
}
