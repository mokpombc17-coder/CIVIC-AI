package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePayload;

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
            Instant createdAt
    ) {
    }

    public ChatMessageEventEnvelope decodeEnvelope() {
        if (eventId == null
                || claimedAttemptCount < 1
                || schemaVersion
                != ChatMessageOutboxEvent.CURRENT_SCHEMA_VERSION
                || !ChatMessageOutboxEvent.AGGREGATE_TYPE.equals(
                aggregateType)
                || eventVersion
                != ChatMessageOutboxEvent.CURRENT_EVENT_VERSION
                || !ChatMessageOutboxEvent.MESSAGE_CREATED.equals(eventType)
                || aggregateId == null
                || roomId == null
                || roomSequence == null
                || occurredAt == null
                || payload == null
                || payload.messageId() == null
                || payload.roomId() == null
                || payload.roomSequence() == null
                || payload.senderUserId() == null
                || payload.clientMessageId() == null
                || payload.content() == null
                || payload.createdAt() == null
                || !aggregateId.equals(payload.messageId())
                || !roomId.equals(payload.roomId())
                || !roomSequence.equals(payload.roomSequence())
                || !occurredAt.equals(payload.createdAt())) {
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
                payload.createdAt());
        return new ChatMessageEventEnvelope(
                eventVersion,
                eventType,
                decodedPayload);
    }
}
