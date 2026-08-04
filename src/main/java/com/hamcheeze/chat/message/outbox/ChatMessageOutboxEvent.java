package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;

import java.time.Instant;
import java.util.Set;
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

    public static final int CURRENT_SCHEMA_VERSION = 2;
    public static final String AGGREGATE_TYPE = "CHAT_MESSAGE";
    public static final int CURRENT_EVENT_VERSION = 1;
    public static final String MESSAGE_CREATED = "CHAT_MESSAGE_CREATED";
    public static final String MESSAGE_UPDATED = "CHAT_MESSAGE_UPDATED";
    public static final String MESSAGE_DELETED = "CHAT_MESSAGE_DELETED";
    public static final String MESSAGE_CREATED_ID_PREFIX =
            "chat-message-created:";
    public static final String MESSAGE_UPDATED_ID_PREFIX =
            "chat-message-updated:";
    public static final String MESSAGE_DELETED_ID_PREFIX =
            "chat-message-deleted:";
    public static final Set<String> SUPPORTED_EVENT_TYPES = Set.of(
            MESSAGE_CREATED,
            MESSAGE_UPDATED,
            MESSAGE_DELETED);

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
                || !SUPPORTED_EVENT_TYPES.contains(eventType)) {
            throw new IllegalArgumentException(
                    "Unsupported chat message outbox event contract");
        }
        if (roomSequence < 1) {
            throw new IllegalArgumentException(
                    "roomSequence must be at least 1");
        }
        if (!eventId.equals(eventId(
                eventType,
                aggregateId,
                payload.messageVersion()))
                || !aggregateId.equals(payload.messageId())
                || !roomId.equals(payload.roomId())
                || roomSequence != payload.roomSequence()) {
            throw new IllegalArgumentException(
                    "Outbox metadata and payload must describe one message");
        }
        validateEventSnapshot(eventType, payload, occurredAt);
    }

    public static ChatMessageOutboxEvent messageCreated(
            ChatMessage message
    ) {
        Objects.requireNonNull(message, "message");
        ChatMessagePayload payload = ChatMessagePayload.from(message);
        return new ChatMessageOutboxEvent(
                messageCreatedEventId(message.messageId()),
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

    public static ChatMessageOutboxEvent messageUpdated(
            ChatMessage message
    ) {
        return mutationEvent(message, MESSAGE_UPDATED);
    }

    public static ChatMessageOutboxEvent messageDeleted(
            ChatMessage message
    ) {
        return mutationEvent(message, MESSAGE_DELETED);
    }

    public static String messageCreatedEventId(String messageId) {
        Objects.requireNonNull(messageId, "messageId");
        if (messageId.isBlank()) {
            throw new IllegalArgumentException(
                    "messageId must not be blank");
        }
        return MESSAGE_CREATED_ID_PREFIX + messageId;
    }

    public static String messageUpdatedEventId(
            String messageId,
            long messageVersion
    ) {
        return versionedEventId(
                MESSAGE_UPDATED_ID_PREFIX,
                messageId,
                messageVersion);
    }

    public static String messageDeletedEventId(
            String messageId,
            long messageVersion
    ) {
        return versionedEventId(
                MESSAGE_DELETED_ID_PREFIX,
                messageId,
                messageVersion);
    }

    public ChatMessageEventEnvelope toEnvelope() {
        return new ChatMessageEventEnvelope(
                eventVersion,
                eventType,
                payload);
    }

    private static ChatMessageOutboxEvent mutationEvent(
            ChatMessage message,
            String eventType
    ) {
        Objects.requireNonNull(message, "message");
        ChatMessagePayload payload = ChatMessagePayload.from(message);
        return new ChatMessageOutboxEvent(
                eventId(eventType, message.messageId(),
                        message.messageVersion()),
                CURRENT_SCHEMA_VERSION,
                AGGREGATE_TYPE,
                message.messageId(),
                CURRENT_EVENT_VERSION,
                eventType,
                message.roomId(),
                message.roomSequence(),
                payload,
                message.updatedAt());
    }

    private static String eventId(
            String eventType,
            String messageId,
            long messageVersion
    ) {
        return switch (eventType) {
            case MESSAGE_CREATED -> messageCreatedEventId(messageId);
            case MESSAGE_UPDATED ->
                    messageUpdatedEventId(messageId, messageVersion);
            case MESSAGE_DELETED ->
                    messageDeletedEventId(messageId, messageVersion);
            default -> throw new IllegalArgumentException(
                    "Unsupported eventType");
        };
    }

    private static String versionedEventId(
            String prefix,
            String messageId,
            long messageVersion
    ) {
        Objects.requireNonNull(messageId, "messageId");
        if (messageId.isBlank()) {
            throw new IllegalArgumentException(
                    "messageId must not be blank");
        }
        if (messageVersion < 2) {
            throw new IllegalArgumentException(
                    "Mutation messageVersion must be at least 2");
        }
        return prefix + messageId + ":v" + messageVersion;
    }

    private static void validateEventSnapshot(
            String eventType,
            ChatMessagePayload payload,
            Instant occurredAt
    ) {
        switch (eventType) {
            case MESSAGE_CREATED -> {
                if (payload.state() != MessageState.ACTIVE
                        || payload.messageVersion() != 1
                        || !occurredAt.equals(payload.createdAt())
                        || !payload.updatedAt().equals(
                        payload.createdAt())) {
                    throw new IllegalArgumentException(
                            "Malformed CREATED event snapshot");
                }
            }
            case MESSAGE_UPDATED -> {
                if (payload.state() != MessageState.ACTIVE
                        || payload.messageVersion() < 2
                        || !occurredAt.equals(payload.updatedAt())) {
                    throw new IllegalArgumentException(
                            "Malformed UPDATED event snapshot");
                }
            }
            case MESSAGE_DELETED -> {
                if (payload.state()
                        != MessageState.DELETED_BY_AUTHOR
                        || payload.messageVersion() < 2
                        || !occurredAt.equals(payload.updatedAt())
                        || !occurredAt.equals(payload.deletedAt())) {
                    throw new IllegalArgumentException(
                            "Malformed DELETED event snapshot");
                }
            }
            default -> throw new IllegalArgumentException(
                    "Unsupported eventType");
        }
    }
}
