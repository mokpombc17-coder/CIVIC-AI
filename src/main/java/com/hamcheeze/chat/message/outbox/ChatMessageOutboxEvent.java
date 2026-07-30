package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.ChatMessage;

import java.time.Instant;
import java.util.Objects;

public record ChatMessageOutboxEvent(
        String eventId,
        int schemaVersion,
        String aggregateType,
        String aggregateId,
        int eventVersion,
        String eventType,
        String roomId,
        long roomSequence,
        ChatMessagePayload payload,
        Instant occurredAt
) {

    public static final int CURRENT_SCHEMA_VERSION = 1;
    public static final String AGGREGATE_TYPE = "CHAT_MESSAGE";
    public static final int CURRENT_EVENT_VERSION = 1;
    public static final String MESSAGE_CREATED = "CHAT_MESSAGE_CREATED";
    public static final String MESSAGE_CREATED_ID_PREFIX =
            "chat-message-created:";

    public ChatMessageOutboxEvent {
        Objects.requireNonNull(eventId, "eventId");
        Objects.requireNonNull(aggregateType, "aggregateType");
        Objects.requireNonNull(aggregateId, "aggregateId");
        Objects.requireNonNull(eventType, "eventType");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(payload, "payload");
        Objects.requireNonNull(occurredAt, "occurredAt");
        if (schemaVersion != CURRENT_SCHEMA_VERSION
                || !AGGREGATE_TYPE.equals(aggregateType)
                || eventVersion != CURRENT_EVENT_VERSION
                || !MESSAGE_CREATED.equals(eventType)) {
            throw new IllegalArgumentException(
                    "Unsupported chat message outbox event contract");
        }
        if (roomSequence < 1) {
            throw new IllegalArgumentException(
                    "roomSequence must be at least 1");
        }
        if (!aggregateId.equals(payload.messageId())
                || !roomId.equals(payload.roomId())
                || roomSequence != payload.roomSequence()
                || !occurredAt.equals(payload.createdAt())) {
            throw new IllegalArgumentException(
                    "Outbox metadata and payload must describe one message");
        }
    }

    public static ChatMessageOutboxEvent messageCreated(
            ChatMessage message
    ) {
        Objects.requireNonNull(message, "message");
        ChatMessagePayload payload = ChatMessagePayload.from(message);
        return new ChatMessageOutboxEvent(
                MESSAGE_CREATED_ID_PREFIX + message.messageId(),
                CURRENT_SCHEMA_VERSION,
                AGGREGATE_TYPE,
                message.messageId(),
                CURRENT_EVENT_VERSION,
                MESSAGE_CREATED,
                message.roomId(),
                message.roomSequence(),
                payload,
                message.createdAt());
    }

    public ChatMessageEventEnvelope toEnvelope() {
        return new ChatMessageEventEnvelope(
                eventVersion,
                eventType,
                payload);
    }
}
