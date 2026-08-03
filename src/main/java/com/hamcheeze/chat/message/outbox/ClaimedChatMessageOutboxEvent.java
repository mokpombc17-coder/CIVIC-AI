package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.MessageState;

import java.time.Instant;

public record ClaimedChatMessageOutboxEvent(
        String eventId,
        long claimedAttemptCount,
        int schemaVersion,
        String aggregateType,
        String aggregateId,
        int eventVersion,
        String eventType,
        String roomId,
        Long roomSequence,
        Payload payload,
        Instant occurredAt
) {

    public record Payload(
            String messageId,
            String roomId,
            Long roomSequence,
            String senderUserId,
            String clientMessageId,
            String content,
            MessageState state,
            Boolean countable,
            Long messageVersion,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt
    ) {
        public Payload(
                String messageId,
                String roomId,
                Long roomSequence,
                String senderUserId,
                String clientMessageId,
                String content,
                MessageState state,
                Long messageVersion,
                Instant createdAt,
                Instant updatedAt,
                Instant deletedAt
        ) {
            this(
                    messageId,
                    roomId,
                    roomSequence,
                    senderUserId,
                    clientMessageId,
                    content,
                    state,
                    true,
                    messageVersion,
                    createdAt,
                    updatedAt,
                    deletedAt);
        }

        public Payload(
                String messageId,
                String roomId,
                Long roomSequence,
                String senderUserId,
                String clientMessageId,
                String content,
                Instant createdAt
        ) {
            this(
                    messageId,
                    roomId,
                    roomSequence,
                    senderUserId,
                    clientMessageId,
                    content,
                    MessageState.ACTIVE,
                    true,
                    1L,
                    createdAt,
                    createdAt,
                    null);
        }
    }

    public ChatMessageEventEnvelope decodeEnvelope() {
        if (isBlank(eventId)
                || claimedAttemptCount < 1
                || schemaVersion
                != ChatMessageOutboxEvent.CURRENT_SCHEMA_VERSION
                || !ChatMessageOutboxEvent.AGGREGATE_TYPE.equals(
                aggregateType)
                || eventVersion
                != ChatMessageOutboxEvent.CURRENT_EVENT_VERSION
                || !ChatMessageOutboxEvent.SUPPORTED_EVENT_TYPES
                .contains(eventType)
                || isBlank(aggregateId)
                || isBlank(roomId)
                || roomSequence == null
                || roomSequence < 1
                || occurredAt == null
                || payload == null
                || isBlank(payload.messageId())
                || isBlank(payload.roomId())
                || payload.roomSequence() == null
                || payload.roomSequence() < 1
                || isBlank(payload.senderUserId())
                || isBlank(payload.clientMessageId())
                || payload.createdAt() == null
                || payload.countable() == null
                || !aggregateId.equals(payload.messageId())
                || !roomId.equals(payload.roomId())
                || !roomSequence.equals(payload.roomSequence())) {
            throw new IllegalArgumentException(
                    "Malformed chat message outbox event");
        }
        ChatMessagePayload decodedPayload = new ChatMessagePayload(
                payload.messageId(),
                payload.roomId(),
                payload.roomSequence(),
                payload.senderUserId(),
                payload.clientMessageId(),
                payload.content(),
                payload.state(),
                payload.countable(),
                payload.messageVersion() == null
                        ? 0 : payload.messageVersion(),
                payload.createdAt(),
                payload.updatedAt(),
                payload.deletedAt());
        return new ChatMessageOutboxEvent(
                eventId,
                schemaVersion,
                aggregateType,
                aggregateId,
                eventVersion,
                eventType,
                roomId,
                roomSequence,
                decodedPayload,
                occurredAt).toEnvelope();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
