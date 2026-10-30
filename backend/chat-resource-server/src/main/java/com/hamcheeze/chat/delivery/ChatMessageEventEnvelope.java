package com.hamcheeze.chat.delivery;

import com.hamcheeze.chat.message.ChatMessage;

import java.util.Objects;

public record ChatMessageEventEnvelope(
        int eventVersion,
        String eventType,
        ChatMessagePayload payload
) {

    public static final int CURRENT_VERSION = 2;
    public static final String MESSAGE_CREATED =
            "CHAT_MESSAGE_CREATED";
    public static final String MESSAGE_UPDATED =
            "CHAT_MESSAGE_UPDATED";
    public static final String MESSAGE_DELETED =
            "CHAT_MESSAGE_DELETED";

    public ChatMessageEventEnvelope {
        if (eventVersion < 1) {
            throw new IllegalArgumentException(
                    "eventVersion must be at least 1");
        }
        Objects.requireNonNull(eventType, "eventType");
        Objects.requireNonNull(payload, "payload");
    }

    public static ChatMessageEventEnvelope messageCreated(
            ChatMessage message
    ) {
        return new ChatMessageEventEnvelope(
                CURRENT_VERSION,
                MESSAGE_CREATED,
                ChatMessagePayload.from(message));
    }

    public static ChatMessageEventEnvelope messageUpdated(
            ChatMessage message
    ) {
        return new ChatMessageEventEnvelope(
                CURRENT_VERSION,
                MESSAGE_UPDATED,
                ChatMessagePayload.from(message));
    }

    public static ChatMessageEventEnvelope messageDeleted(
            ChatMessage message
    ) {
        return new ChatMessageEventEnvelope(
                CURRENT_VERSION,
                MESSAGE_DELETED,
                ChatMessagePayload.from(message));
    }
}
