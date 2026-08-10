package com.hamcheeze.chat.message.context;

import com.hamcheeze.chat.message.ChatMessage;

import java.util.List;
import java.util.Objects;

public record ChatMessageContext(
        String targetMessageId,
        long targetRoomSequence,
        List<ChatMessage> items,
        Long nextBeforeSequence,
        Long nextAfterSequence,
        boolean hasOlder,
        boolean hasNewer
) {

    public ChatMessageContext {
        if (targetMessageId == null || targetMessageId.isBlank()) {
            throw new IllegalArgumentException(
                    "targetMessageId must not be blank");
        }
        if (targetRoomSequence < 1) {
            throw new IllegalArgumentException(
                    "targetRoomSequence must be positive");
        }
        items = List.copyOf(Objects.requireNonNull(items, "items"));
        long targetCount = items.stream()
                .filter(message -> message.messageId().equals(
                        targetMessageId))
                .count();
        if (targetCount != 1) {
            throw new IllegalArgumentException(
                    "context must contain target exactly once");
        }
        for (int index = 0; index < items.size(); index++) {
            ChatMessage message = items.get(index);
            if (index > 0 && items.get(index - 1).roomSequence()
                    >= message.roomSequence()) {
                throw new IllegalArgumentException(
                        "context items must be strictly ascending");
            }
        }
        if (hasOlder != (nextBeforeSequence != null)
                || hasNewer != (nextAfterSequence != null)) {
            throw new IllegalArgumentException(
                    "context continuation fields are inconsistent");
        }
    }
}
