package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.context.ChatMessageContext;

import java.util.List;
import java.util.Objects;

public record ChatMessageContextResponse(
        String targetMessageId,
        long targetRoomSequence,
        List<ChatMessagePayload> items,
        Long nextBeforeSequence,
        Long nextAfterSequence,
        boolean hasOlder,
        boolean hasNewer
) {

    public static ChatMessageContextResponse from(
            ChatMessageContext context
    ) {
        Objects.requireNonNull(context, "context");
        return new ChatMessageContextResponse(
                context.targetMessageId(),
                context.targetRoomSequence(),
                context.items().stream()
                        .map(ChatMessagePayload::from)
                        .toList(),
                context.nextBeforeSequence(),
                context.nextAfterSequence(),
                context.hasOlder(),
                context.hasNewer());
    }
}
